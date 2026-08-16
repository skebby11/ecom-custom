/**
 * Serializza un valore per iniettarlo con `set:html` dentro un tag `<script>`.
 * `JSON.stringify` da solo lascia il carattere minore-di invariato: se il valore
 * contiene una stringa come la chiusura di un tag script o un commento HTML
 * proveniente dall'API (titolo prodotto, slug, ecc.), quella sequenza chiuderebbe
 * o riaprirebbe il tag e permetterebbe di iniettare markup arbitrario. Sostituirlo
 * con la sequenza di escape unicode corrispondente neutralizza entrambi i vettori
 * senza alterare il JSON. U+2028/U+2029 (line/paragraph separator) sono validi
 * in una stringa JSON ma non lo erano in una stringa JS prima di ES2019: li
 * sostituiamo comunque per difesa in profondità, così l'helper resta sicuro
 * anche se in futuro venisse riusato per iniettare JS eseguibile e non solo dati.
 *
 * `JSON.stringify` restituisce `undefined` per input non serializzabili
 * (`undefined`, funzioni, simboli): senza il fallback a `'null'`, `.replace`
 * lancerebbe su quel valore.
 */
export function toSafeJson(value: unknown): string {
  const json = JSON.stringify(value) ?? 'null'
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
