-- =====================================================
-- PARCHE DE SEGURIDAD — Ejecutar en Supabase > SQL Editor
-- =====================================================

-- 1. Eliminar columna admin_password (expuesta públicamente, no usada para auth)
ALTER TABLE config DROP COLUMN IF EXISTS admin_password;

-- 2. Función de verificación de PIN (los PINs nunca salen del servidor)
--    Los participantes llaman a esta función; reciben true/false, nunca el PIN real.
CREATE OR REPLACE FUNCTION verify_participant_pin(p_participant_id TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_pin TEXT;
BEGIN
  SELECT pin INTO stored_pin FROM participants WHERE id = p_participant_id;
  IF stored_pin IS NULL THEN RETURN FALSE; END IF;
  RETURN stored_pin::text = p_pin::text;
END;
$$;

-- Permitir que usuarios anónimos llamen a la función
GRANT EXECUTE ON FUNCTION verify_participant_pin(TEXT, TEXT) TO anon;
