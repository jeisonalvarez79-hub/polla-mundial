-- =====================================================
-- MIGRACIÓN: Eliminar bcrypt y volver a PINs en texto plano
-- Ejecutar en: Supabase > SQL Editor > New Query
-- =====================================================

-- 1. Eliminar el trigger que hasheaba los PINs automáticamente
DROP TRIGGER IF EXISTS hash_pin_before_save ON public.participants;
DROP FUNCTION IF EXISTS public.hash_pin_on_save();

-- 2. Actualizar verify_participant_pin para soportar ambos formatos:
--    - PINs antiguos: guardados como bcrypt ($2a$...) → verificar con crypt()
--    - PINs nuevos: guardados en texto plano → comparación directa
CREATE OR REPLACE FUNCTION public.verify_participant_pin(
    p_participant_id TEXT,
    p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog, pg_temp
AS $$
DECLARE
    stored_pin TEXT;
BEGIN
    SELECT pin INTO stored_pin
    FROM public.participants
    WHERE id = p_participant_id;

    IF stored_pin IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Participantes con PIN antiguo (bcrypt): verificar con crypt()
    IF stored_pin LIKE '$2a$%' OR stored_pin LIKE '$2b$%' THEN
        RETURN stored_pin = extensions.crypt(p_pin, stored_pin);
    END IF;

    -- Participantes nuevos: PIN en texto plano
    RETURN stored_pin = p_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_participant_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_participant_pin(TEXT, TEXT) TO anon, authenticated;
