/**
 * Serializza un valore per iniettarlo con `set:html` dentro un tag `<script>`.
 * `JSON.stringify` da solo lascia `<` invariato: se il valore contiene una stringa
 * come `</script>` proveniente dall'API (titolo prodotto, slug, ecc.), quella
 * sequenza chiuderebbe il tag e permetterebbe di iniettare markup arbitrario.
 * Sostituire `<` con `\\u003c` neutralizza il problema senza alterare il JSON.
 */
export function toSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
