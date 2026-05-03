-- ============================================================
-- SCHEMA V2 — FASE 2 GRADUACIONES
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ALTERACIONES DE TABLAS EXISTENTES
-- ────────────────────────────────────────────────────────────

-- Agregar cuota inicial al evento (default $50)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS initial_fee     NUMERIC(10,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS guest_deadline  DATE;  -- fecha límite para cambiar invitados

-- Agregar flag de cuota inicial a pagos
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_initial_fee  BOOLEAN NOT NULL DEFAULT FALSE;

-- Agregar parallel_id a users para el rol admin_paralelo
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parallel_id UUID REFERENCES parallels(id) ON DELETE SET NULL;

-- Actualizar constraint de rol para incluir admin_paralelo
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'admin_paralelo', 'padre'));

-- ────────────────────────────────────────────────────────────
-- 2. ACTUALIZAR EVENTO DE EJEMPLO CON VALORES REALES
-- ────────────────────────────────────────────────────────────

UPDATE events SET
  base_price         = 560.00,
  guest_price        = 90.00,
  installments_count = 25,
  initial_fee        = 50.00,
  first_due_date     = '2025-02-01'
WHERE name = 'Graduación 2025';

-- Si no existe el evento, insertarlo
INSERT INTO events (name, event_date, base_price, guest_price, installments_count, initial_fee, first_due_date)
SELECT 'Graduación 2025', '2025-11-28', 560.00, 90.00, 25, 50.00, '2025-02-01'
WHERE NOT EXISTS (SELECT 1 FROM events);

-- ────────────────────────────────────────────────────────────
-- 3. FUNCIONES SQL ACTUALIZADAS
-- ────────────────────────────────────────────────────────────

-- Calcula el total bruto del estudiante (sin descontar anticipo)
-- total = base_price + guests_count * guest_price - special_discount
CREATE OR REPLACE FUNCTION calculate_student_total(p_student_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT GREATEST(
    e.base_price + (s.guests_count * e.guest_price) - s.special_discount,
    0
  )
  INTO v_total
  FROM students s
  JOIN events e ON e.id = s.event_id
  WHERE s.id = p_student_id;

  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Calcula el saldo (total - cuota inicial) que se financia en cuotas
CREATE OR REPLACE FUNCTION calculate_student_balance(p_student_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total       NUMERIC;
  v_initial_fee NUMERIC;
BEGIN
  SELECT calculate_student_total(p_student_id), e.initial_fee
  INTO   v_total, v_initial_fee
  FROM students s
  JOIN events e ON e.id = s.event_id
  WHERE s.id = p_student_id;

  RETURN GREATEST(v_total - COALESCE(v_initial_fee, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Genera (o regenera) cuotas mensuales sobre el SALDO (total - initial_fee)
-- Preserva cuotas ya pagadas o parciales; regenera solo las pendientes
CREATE OR REPLACE FUNCTION generate_installments(p_student_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event           events%ROWTYPE;
  v_student         students%ROWTYPE;
  v_balance         NUMERIC;
  v_installment_amt NUMERIC;
  v_due_date        DATE;
  v_i               INTEGER;
  v_paid_so_far     NUMERIC;
  v_remaining       NUMERIC;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  SELECT * INTO v_event   FROM events   WHERE id = v_student.event_id;

  v_balance         := calculate_student_balance(p_student_id);
  v_installment_amt := ROUND(v_balance / GREATEST(v_event.installments_count, 1), 2);

  -- Cuánto se ha abonado ya en cuotas (excluyendo la cuota inicial)
  SELECT COALESCE(SUM(paid_amount), 0)
  INTO   v_paid_so_far
  FROM   installments
  WHERE  student_id = p_student_id;

  -- Eliminar solo cuotas pendientes (preservar historial)
  DELETE FROM installments
  WHERE  student_id = p_student_id AND status = 'pendiente';

  v_remaining := GREATEST(v_balance - v_paid_so_far, 0);

  FOR v_i IN 1..v_event.installments_count LOOP
    v_due_date := v_event.first_due_date + ((v_i - 1) * INTERVAL '1 month');

    -- Saltear cuotas con número ya existente (parciales)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM installments
      WHERE  student_id = p_student_id AND installment_number = v_i
    );

    EXIT WHEN v_remaining <= 0;

    INSERT INTO installments (student_id, installment_number, due_date, amount, status)
    VALUES (
      p_student_id,
      v_i,
      v_due_date,
      LEAST(v_installment_amt, v_remaining),
      'pendiente'
    );
    v_remaining := v_remaining - v_installment_amt;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica un pago a cuotas pendientes en orden cronológico
-- OMITE pagos marcados como cuota inicial (is_initial_fee = TRUE)
CREATE OR REPLACE FUNCTION apply_payment_to_installments(p_payment_id UUID)
RETURNS VOID AS $$
DECLARE
  v_payment     payments%ROWTYPE;
  v_installment installments%ROWTYPE;
  v_remaining   NUMERIC;
  v_apply       NUMERIC;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;

  -- La cuota inicial no se aplica a las cuotas mensuales
  IF v_payment.is_initial_fee THEN
    RETURN;
  END IF;

  v_remaining := v_payment.amount;

  FOR v_installment IN
    SELECT * FROM installments
    WHERE  student_id = v_payment.student_id
      AND  status IN ('pendiente', 'parcial')
    ORDER BY due_date ASC, installment_number ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, v_installment.amount - v_installment.paid_amount);

    UPDATE installments SET
      paid_amount = paid_amount + v_apply,
      status = CASE
        WHEN paid_amount + v_apply >= amount THEN 'pagado'
        ELSE 'parcial'
      END
    WHERE id = v_installment.id;

    v_remaining := v_remaining - v_apply;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 4. TRIGGERS ACTUALIZADOS / NUEVOS
-- ────────────────────────────────────────────────────────────

-- Trigger de generación de cuotas al INSERTAR estudiante
-- (reemplaza el existente — corrige también el updated_at)
CREATE OR REPLACE FUNCTION trg_student_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM generate_installments(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_student_insert ON students;
CREATE TRIGGER after_student_insert
  AFTER INSERT ON students
  FOR EACH ROW EXECUTE FUNCTION trg_student_after_insert();

-- Trigger: regenerar cuotas cuando cambian campos que afectan el total
CREATE OR REPLACE FUNCTION trg_student_before_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();

  IF OLD.guests_count     IS DISTINCT FROM NEW.guests_count
  OR OLD.special_discount IS DISTINCT FROM NEW.special_discount
  OR OLD.special_case     IS DISTINCT FROM NEW.special_case
  THEN
    -- Se llama DESPUÉS del UPDATE; se usa un trigger AFTER para regenerar
    -- Aquí solo marcamos el timestamp
    NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_student_update ON students;
CREATE TRIGGER before_student_update
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION trg_student_before_update();

CREATE OR REPLACE FUNCTION trg_student_after_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.guests_count     IS DISTINCT FROM NEW.guests_count
  OR OLD.special_discount IS DISTINCT FROM NEW.special_discount
  OR OLD.special_case     IS DISTINCT FROM NEW.special_case
  THEN
    PERFORM generate_installments(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_student_update ON students;
CREATE TRIGGER after_student_update
  AFTER UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION trg_student_after_update();

-- Trigger: auto-crear cuota inicial ($50) al registrar un estudiante
CREATE OR REPLACE FUNCTION trg_create_initial_fee_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_fee NUMERIC;
BEGIN
  SELECT initial_fee INTO v_fee FROM events WHERE id = NEW.event_id;

  IF COALESCE(v_fee, 0) > 0 THEN
    INSERT INTO payments (student_id, amount, payment_date, method, notes, is_initial_fee)
    VALUES (NEW.id, v_fee, CURRENT_DATE, 'efectivo', 'Cuota inicial', TRUE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS after_student_insert_initial_fee ON students;
CREATE TRIGGER after_student_insert_initial_fee
  AFTER INSERT ON students
  FOR EACH ROW EXECUTE FUNCTION trg_create_initial_fee_payment();

-- Trigger: aplicar pago a cuotas al insertar (sin cambios, ya filtra is_initial_fee)
CREATE OR REPLACE FUNCTION trg_apply_payment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM apply_payment_to_installments(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_payment_insert ON payments;
CREATE TRIGGER after_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_apply_payment();

-- Trigger: crear perfil de usuario (añade soporte para parallel_id y admin_paralelo)
CREATE OR REPLACE FUNCTION trg_create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'padre')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trg_create_user_profile();

-- ────────────────────────────────────────────────────────────
-- 5. FUNCIONES HELPER DE RLS
-- ────────────────────────────────────────────────────────────

-- ¿El usuario actual es admin total?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿El usuario actual es admin de paralelo?
CREATE OR REPLACE FUNCTION is_admin_paralelo()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin_paralelo'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Paralelo asignado al admin_paralelo actual
CREATE OR REPLACE FUNCTION my_parallel_id()
RETURNS UUID AS $$
  SELECT parallel_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Student_id vinculado al padre actual
CREATE OR REPLACE FUNCTION my_student_id()
RETURNS UUID AS $$
  SELECT id FROM students WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 6. RLS POLICIES ACTUALIZADAS (admin_paralelo)
-- ────────────────────────────────────────────────────────────

-- STUDENTS: admin_paralelo ve solo su paralelo; puede registrar pagos ahí
DROP POLICY IF EXISTS "students_admin_paralelo" ON students;
CREATE POLICY "students_admin_paralelo"
  ON students FOR SELECT
  USING (
    is_admin_paralelo()
    AND parallel_id = my_parallel_id()
  );

-- INSTALLMENTS: admin_paralelo ve cuotas de estudiantes de su paralelo
DROP POLICY IF EXISTS "installments_admin_paralelo" ON installments;
CREATE POLICY "installments_admin_paralelo"
  ON installments FOR SELECT
  USING (
    is_admin_paralelo()
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = installments.student_id
        AND s.parallel_id = my_parallel_id()
    )
  );

-- PAYMENTS: admin_paralelo puede ver e insertar pagos de su paralelo
DROP POLICY IF EXISTS "payments_admin_paralelo_select" ON payments;
CREATE POLICY "payments_admin_paralelo_select"
  ON payments FOR SELECT
  USING (
    is_admin_paralelo()
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = payments.student_id
        AND s.parallel_id = my_parallel_id()
    )
  );

DROP POLICY IF EXISTS "payments_admin_paralelo_insert" ON payments;
CREATE POLICY "payments_admin_paralelo_insert"
  ON payments FOR INSERT
  WITH CHECK (
    is_admin_paralelo()
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = payments.student_id
        AND s.parallel_id = my_parallel_id()
    )
  );

-- PARALLELS: admin_paralelo puede ver solo el suyo
DROP POLICY IF EXISTS "parallels_admin_paralelo" ON parallels;
CREATE POLICY "parallels_admin_paralelo"
  ON parallels FOR SELECT
  USING (
    is_admin_paralelo()
    AND id = my_parallel_id()
  );

-- USERS: admin_paralelo puede ver perfiles de padres de su paralelo
DROP POLICY IF EXISTS "users_admin_paralelo" ON users;
CREATE POLICY "users_admin_paralelo"
  ON users FOR SELECT
  USING (
    is_admin_paralelo()
    AND (
      id = auth.uid()  -- su propio perfil
      OR EXISTS (      -- o padres de su paralelo
        SELECT 1 FROM students s
        WHERE s.user_id = users.id
          AND s.parallel_id = my_parallel_id()
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- 7. DATOS INICIALES — PARALELOS
-- ────────────────────────────────────────────────────────────

-- Insertar los 3 paralelos si no existen
DO $$
DECLARE v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id FROM events LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    INSERT INTO parallels (event_id, name) VALUES
      (v_event_id, 'Ciencias A'),
      (v_event_id, 'Ciencias B'),
      (v_event_id, 'Técnico')
    ON CONFLICT (event_id, name) DO NOTHING;
  END IF;
END $$;
