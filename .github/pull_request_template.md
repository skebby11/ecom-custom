<!--
Compila solo le sezioni rilevanti per questa PR. Se una sezione non si
applica (es. nessuna migrazione), cancellala invece di lasciarla vuota.
-->

## Cosa cambia

<!-- Una descrizione breve del cambiamento. Se tocca un contratto in
     packages/shared o una rotta in apps/api/src/routes/, dillo esplicitamente. -->

## Perché

<!-- Il problema che risolve o la richiesta a cui risponde. -->

## Come è stato verificato

<!-- Comandi eseguiti, casi provati a mano, screenshot se cambia la UI. -->

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Provato a mano in locale (`npm run dev`)

## Checklist

- [ ] Se ho cambiato la forma di un payload, l'ho aggiornata in
      `packages/shared/src/index.ts` (non duplicata in locale)
- [ ] Se ho aggiunto/modificato una rotta API, ho aggiornato `docs/API.md`
      nello stesso commit
- [ ] Nessun `Math.round`/`parseFloat` su importi in euro (solo interi in
      centesimi, conversione su stringa)

## Note per chi revisiona

<!-- Punti su cui vuoi un'attenzione particolare, decisioni discutibili,
     cose lasciate volutamente fuori scope. -->
