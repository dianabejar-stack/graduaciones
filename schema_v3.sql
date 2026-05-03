-- ============================================================
-- SCHEMA V3 — Sistema de usuarios y roles
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema_v2.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. RPC: verificar si un email existe en students
--    Llamable con anon key desde la página de registro
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION student_email_exists(p_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM students WHERE LOWER(email) = LOWER(p_email)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION student_email_exists TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. RPC: vincular estudiante por email (llamada tras signUp)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_student_by_email(p_user_id UUID, p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE students
  SET user_id = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND user_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION link_student_by_email TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Trigger actualizado: auto-vincular estudiante al crear usuario
--    También acepta el nuevo rol admin_paralelo desde metadata
-- ────────────────────────────────────────────────────────────
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

  -- Vincular automáticamente si el email existe en students
  UPDATE students
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar que el trigger existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trg_create_user_profile();

-- ────────────────────────────────────────────────────────────
-- 4. RLS: admin puede vincular/desvincular estudiantes
--    (UPDATE sobre students.user_id)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "students_admin_update_link" ON students;
CREATE POLICY "students_admin_update_link"
  ON students FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- admin_paralelo puede ver eventos (necesario para reportes)
DROP POLICY IF EXISTS "events_admin_paralelo" ON events;
CREATE POLICY "events_admin_paralelo"
  ON events FOR SELECT
  USING (is_admin_paralelo());
