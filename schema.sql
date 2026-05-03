-- ============================================================
-- ESQUEMA GRADUACIONES MVP — ejecutar completo en SQL Editor
-- ============================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLAS
-- ============================================================

-- Evento de graduación (una sola fila en el MVP)
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  event_date        DATE,
  base_price        NUMERIC(10,2) NOT NULL DEFAULT 0,   -- precio base por estudiante
  guest_price       NUMERIC(10,2) NOT NULL DEFAULT 0,   -- precio por invitado adicional
  installments_count INTEGER NOT NULL DEFAULT 10,       -- número de cuotas mensuales
  first_due_date    DATE NOT NULL DEFAULT CURRENT_DATE, -- fecha de la primera cuota
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Paralelos del año escolar (ej: "3ro A", "3ro B")
CREATE TABLE IF NOT EXISTS parallels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, name)
);

-- Perfiles de usuario que extienden auth.users
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'padre' CHECK (role IN ('admin', 'padre')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estudiantes con toda su información de graduación
CREATE TABLE IF NOT EXISTS students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parallel_id         UUID REFERENCES parallels(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL, -- padre vinculado
  full_name           TEXT NOT NULL,
  representative_name TEXT NOT NULL,
  email               TEXT NOT NULL,
  guests_count        INTEGER NOT NULL DEFAULT 0 CHECK (guests_count >= 0),
  table_number        INTEGER,
  special_case        BOOLEAN NOT NULL DEFAULT FALSE,
  special_discount    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (special_discount >= 0),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Cuotas mensuales generadas automáticamente por estudiante
CREATE TABLE IF NOT EXISTS installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (status IN ('pendiente', 'pagado', 'parcial')),
  paid_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, installment_number)
);

-- Registros de pagos realizados
CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method       TEXT NOT NULL CHECK (method IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FUNCIONES SQL
-- ============================================================

-- Calcula el total que debe pagar un estudiante
-- Fórmula: base_price + guests_count * guest_price - special_discount
CREATE OR REPLACE FUNCTION calculate_student_total(p_student_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT
    e.base_price + (s.guests_count * e.guest_price) - s.special_discount
  INTO v_total
  FROM students s
  JOIN events e ON e.id = s.event_id
  WHERE s.id = p_student_id;

  RETURN GREATEST(v_total, 0); -- nunca retornar valor negativo
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Genera o regenera cuotas para un estudiante
-- Divide el total entre el número de cuotas del evento
-- Si ya existen cuotas: ajusta las pendientes, respeta las pagadas
CREATE OR REPLACE FUNCTION generate_installments(p_student_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event          events%ROWTYPE;
  v_student        students%ROWTYPE;
  v_total          NUMERIC;
  v_installment_amt NUMERIC;
  v_due_date       DATE;
  v_i              INTEGER;
  v_paid_so_far    NUMERIC;
  v_remaining      NUMERIC;
BEGIN
  -- Cargar datos del estudiante y su evento
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  SELECT * INTO v_event   FROM events   WHERE id = v_student.event_id;

  v_total           := calculate_student_total(p_student_id);
  v_installment_amt := ROUND(v_total / v_event.installments_count, 2);

  -- Total ya pagado hasta ahora (suma de cuotas pagadas/parciales)
  SELECT COALESCE(SUM(paid_amount), 0)
  INTO v_paid_so_far
  FROM installments
  WHERE student_id = p_student_id;

  -- Eliminar solo cuotas pendientes (preservar historial de pagadas)
  DELETE FROM installments
  WHERE student_id = p_student_id AND status = 'pendiente';

  v_remaining := GREATEST(v_total - v_paid_so_far, 0);

  -- Regenerar cuotas pendientes
  FOR v_i IN 1..v_event.installments_count LOOP
    v_due_date := v_event.first_due_date + ((v_i - 1) * INTERVAL '1 month');

    -- Saltear cuotas que ya tienen número registrado (parcialmente pagadas)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM installments
      WHERE student_id = p_student_id AND installment_number = v_i
    );

    -- Solo crear cuotas si queda saldo
    IF v_remaining > 0 THEN
      INSERT INTO installments (student_id, installment_number, due_date, amount, status)
      VALUES (
        p_student_id,
        v_i,
        v_due_date,
        LEAST(v_installment_amt, v_remaining),
        'pendiente'
      );
      v_remaining := v_remaining - v_installment_amt;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica un pago a las cuotas pendientes en orden cronológico
-- Se llama automáticamente al insertar un pago (ver trigger abajo)
CREATE OR REPLACE FUNCTION apply_payment_to_installments(p_payment_id UUID)
RETURNS VOID AS $$
DECLARE
  v_payment     payments%ROWTYPE;
  v_installment installments%ROWTYPE;
  v_remaining   NUMERIC;
  v_apply       NUMERIC;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  v_remaining := v_payment.amount;

  -- Iterar cuotas pendientes o parciales en orden cronológico
  FOR v_installment IN
    SELECT * FROM installments
    WHERE student_id = v_payment.student_id
      AND status IN ('pendiente', 'parcial')
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

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger: auto-generar cuotas al crear un estudiante
CREATE OR REPLACE FUNCTION trg_student_generate_installments()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM generate_installments(NEW.id);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER after_student_insert
  AFTER INSERT ON students
  FOR EACH ROW EXECUTE FUNCTION trg_student_generate_installments();

-- Trigger: regenerar cuotas al editar campos que afectan el total
CREATE OR REPLACE FUNCTION trg_student_update_installments()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.guests_count    <> NEW.guests_count
  OR OLD.special_discount <> NEW.special_discount
  OR OLD.special_case    <> NEW.special_case
  THEN
    PERFORM generate_installments(NEW.id);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER before_student_update
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION trg_student_update_installments();

-- Trigger: aplicar pago a cuotas al insertar un pago
CREATE OR REPLACE FUNCTION trg_apply_payment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM apply_payment_to_installments(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER after_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_apply_payment();

-- Trigger: crear perfil en users al registrar un usuario en auth
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trg_create_user_profile();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE parallels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE students     ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;

-- Helper: verificar si el usuario actual es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: obtener student_id vinculado al usuario actual (padre)
CREATE OR REPLACE FUNCTION my_student_id()
RETURNS UUID AS $$
  SELECT id FROM students WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- EVENTS: admins gestionan, todos los autenticados pueden leer
CREATE POLICY "events_admin_all"   ON events FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "events_read_auth"   ON events FOR SELECT USING (auth.uid() IS NOT NULL);

-- PARALLELS: admins gestionan, autenticados leen
CREATE POLICY "parallels_admin_all"  ON parallels FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "parallels_read_auth"  ON parallels FOR SELECT USING (auth.uid() IS NOT NULL);

-- USERS: admins ven todo, cada usuario ve su propio perfil
CREATE POLICY "users_admin_all"    ON users FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "users_own_profile"  ON users FOR SELECT USING (id = auth.uid());

-- STUDENTS: admins gestionan, padres ven solo su registro
CREATE POLICY "students_admin_all" ON students FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "students_own"       ON students FOR SELECT USING (user_id = auth.uid());

-- INSTALLMENTS: admins ven todo, padres ven solo sus cuotas
CREATE POLICY "installments_admin_all" ON installments FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "installments_own"       ON installments FOR SELECT USING (student_id = my_student_id());

-- PAYMENTS: admins gestionan, padres ven sus propios pagos
CREATE POLICY "payments_admin_all" ON payments FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "payments_own"       ON payments FOR SELECT USING (student_id = my_student_id());

-- ============================================================
-- DATOS INICIALES DE EJEMPLO (opcional — comentar si no se desea)
-- ============================================================

INSERT INTO events (name, event_date, base_price, guest_price, installments_count, first_due_date)
VALUES ('Graduación 2025', '2025-11-28', 180.00, 35.00, 10, '2025-02-01')
ON CONFLICT DO NOTHING;
