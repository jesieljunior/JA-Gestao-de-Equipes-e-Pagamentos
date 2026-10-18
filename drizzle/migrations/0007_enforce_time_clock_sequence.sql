CREATE OR REPLACE FUNCTION public.validar_sequencia_novo_ponto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipos tipo_ponto[];
  v_esperado tipo_ponto;
BEGIN
  IF NEW.status = 'recusado' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(p.tipo ORDER BY p.registrado_em, p.criado_em), ARRAY[]::tipo_ponto[])
  INTO v_tipos
  FROM public.pontos p
  WHERE p.escala_id = NEW.escala_id
    AND p.status <> 'recusado';

  IF array_length(v_tipos, 1) IS NULL THEN
    v_esperado := 'entrada';
  ELSIF array_length(v_tipos, 1) = 1 AND v_tipos[1] = 'entrada' THEN
    v_esperado := 'inicio_intervalo';
  ELSIF array_length(v_tipos, 1) = 2 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' THEN
    v_esperado := 'fim_intervalo';
  ELSIF array_length(v_tipos, 1) = 3 AND v_tipos[1] = 'entrada' AND v_tipos[2] = 'inicio_intervalo' AND v_tipos[3] = 'fim_intervalo' THEN
    v_esperado := 'saida';
  ELSE
    RAISE EXCEPTION 'A sequência de ponto desta escala precisa ser corrigida pelo supervisor.';
  END IF;

  IF NEW.tipo <> v_esperado THEN
    RAISE EXCEPTION 'Registro fora da sequência esperada. Próximo registro: %.', v_esperado;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_pontos_validar_sequencia
BEFORE INSERT ON public.pontos
FOR EACH ROW EXECUTE FUNCTION public.validar_sequencia_novo_ponto();