import { DEFAULT_VARIANT_TITLE, slugify } from '@ecom/shared/format'

/**
 * Editor prodotto: gestisce slug automatico, righe immagini/opzioni riordinabili,
 * generazione automatica delle varianti dal prodotto cartesiano delle opzioni, e
 * il salvataggio via fetch verso l'API (il cookie di sessione viaggia con
 * `credentials: 'include'`, non serve inoltrarlo manualmente).
 */

/* ------------------------------------------------------------------ */
/* Prezzi: input in euro (virgola o punto), conversione in centesimi   */
/* interi senza passare da moltiplicazioni su float.                   */
/* ------------------------------------------------------------------ */

/** Converte un importo in euro (stringa utente) in centesimi interi. Ritorna null se non valido. */
export function euroToCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [intPart, decPart = ''] = normalized.split('.')
  const centsPart = decPart.padEnd(2, '0').slice(0, 2)
  return Number(intPart) * 100 + Number(centsPart)
}

/** Converte centesimi in una stringa euro con virgola, per precompilare gli input. */
export function centsToEuroInput(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

/* ------------------------------------------------------------------ */
/* Tipi di scambio con l'Astro component (JSON embedded nella pagina)  */
/* ------------------------------------------------------------------ */
interface InitialImage {
  url: string
  alt: string
}

interface InitialOption {
  name: string
  values: string[]
}

interface InitialVariant {
  id?: number
  sku: string
  title: string
  priceEuro: string
  compareAtEuro: string
  stock: number
  optionValues: string[]
}

interface InitialData {
  images: InitialImage[]
  options: InitialOption[]
  variants: InitialVariant[]
  collectionSlugs: string[]
}

interface ZodFlatten {
  formErrors: string[]
  fieldErrors: Record<string, string[] | undefined>
}

/* ------------------------------------------------------------------ */
/* Utility DOM                                                         */
/* ------------------------------------------------------------------ */
function cloneTemplate(id: string): HTMLElement {
  const template = document.getElementById(id) as HTMLTemplateElement | null
  if (!template) throw new Error(`Template mancante: #${id}`)
  const fragment = template.content.cloneNode(true) as DocumentFragment
  const el = fragment.firstElementChild as HTMLElement | null
  if (!el) throw new Error(`Template vuoto: #${id}`)
  return el
}

function field<T extends HTMLElement>(row: HTMLElement, name: string): T {
  const el = row.querySelector(`[data-field="${name}"]`) as T | null
  if (!el) throw new Error(`Campo mancante: ${name}`)
  return el
}

/** Prodotto cartesiano di più array di stringhe, in ordine. */
function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, curr) => acc.flatMap((combo) => curr.map((value) => [...combo, value])),
    [[]]
  )
}

export function initProductEditor(): void {
  const form = document.getElementById('product-form') as HTMLFormElement | null
  if (!form) return

  const mode = form.dataset.mode === 'edit' ? 'edit' : 'create'
  const productId = form.dataset.productId ?? ''

  const dataScript = document.getElementById('product-editor-data')
  const initial: InitialData = dataScript
    ? JSON.parse(dataScript.textContent ?? '{}')
    : { images: [], options: [], variants: [], collectionSlugs: [] }

  const titleInput = document.getElementById('title') as HTMLInputElement
  const slugInput = document.getElementById('slug') as HTMLInputElement
  const imageRows = document.getElementById('image-rows') as HTMLElement
  const imagesEmpty = document.getElementById('images-empty') as HTMLElement
  const addImageBtn = document.getElementById('add-image') as HTMLButtonElement
  const optionRows = document.getElementById('option-rows') as HTMLElement
  const addOptionBtn = document.getElementById('add-option') as HTMLButtonElement
  const variantRows = document.getElementById('variant-rows') as HTMLTableSectionElement
  const regenerateBtn = document.getElementById('regenerate-variants') as HTMLButtonElement
  const formError = document.getElementById('form-error') as HTMLElement
  const saveStatus = document.getElementById('save-status') as HTMLElement
  const submitButton = document.getElementById('submit-button') as HTMLButtonElement

  const MAX_OPTIONS = 3
  // Base URL pubblica dell'API: sostituita a build time da Vite (variabile PUBLIC_*).
  const API_BASE = (import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

  /* ------------------------- Slug automatico ------------------------- */
  let slugTouched = slugInput.value.trim() !== ''
  slugInput.addEventListener('input', () => {
    slugTouched = true
  })
  titleInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(titleInput.value)
  })

  /* ---------------------------- Immagini ------------------------------ */
  function refreshImagesEmptyState(): void {
    imagesEmpty.classList.toggle('hidden', imageRows.children.length > 0)
  }

  function addImageRow(data?: InitialImage): void {
    const row = cloneTemplate('image-row-template')
    field<HTMLInputElement>(row, 'url').value = data?.url ?? ''
    field<HTMLInputElement>(row, 'alt').value = data?.alt ?? ''
    imageRows.appendChild(row)
    refreshImagesEmptyState()
  }

  imageRows.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target) return
    const row = target.closest<HTMLElement>('[data-row]')
    if (!row) return
    const action = target.dataset.action

    if (action === 'remove') {
      row.remove()
      refreshImagesEmptyState()
    } else if (action === 'move-up' && row.previousElementSibling) {
      row.parentElement?.insertBefore(row, row.previousElementSibling)
    } else if (action === 'move-down' && row.nextElementSibling) {
      row.parentElement?.insertBefore(row.nextElementSibling, row)
    }
  })

  addImageBtn.addEventListener('click', () => addImageRow())

  for (const image of initial.images) addImageRow(image)
  refreshImagesEmptyState()

  /* ---------------------------- Opzioni -------------------------------- */
  function refreshAddOptionState(): void {
    addOptionBtn.disabled = optionRows.children.length >= MAX_OPTIONS
  }

  function addOptionRow(data?: InitialOption): void {
    if (optionRows.children.length >= MAX_OPTIONS) return
    const row = cloneTemplate('option-row-template')
    field<HTMLInputElement>(row, 'name').value = data?.name ?? ''
    field<HTMLInputElement>(row, 'values').value = data?.values.join(', ') ?? ''
    optionRows.appendChild(row)
    refreshAddOptionState()
  }

  optionRows.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action="remove"]')
    if (!target) return
    target.closest<HTMLElement>('[data-row]')?.remove()
    refreshAddOptionState()
    regenerateVariants()
  })

  optionRows.addEventListener('input', () => regenerateVariants())

  addOptionBtn.addEventListener('click', () => {
    addOptionRow()
  })

  for (const option of initial.options) addOptionRow(option)
  refreshAddOptionState()

  /* ---------------------------- Varianti -------------------------------- */
  /** Legge le opzioni valide (nome + almeno un valore) direttamente dal DOM, nell'ordine delle righe. */
  function currentOptions(): { name: string; values: string[] }[] {
    const options: { name: string; values: string[] }[] = []
    for (const row of Array.from(optionRows.children) as HTMLElement[]) {
      const name = field<HTMLInputElement>(row, 'name').value.trim()
      const values = field<HTMLInputElement>(row, 'values')
        .value.split(',')
        .map((v) => v.trim())
        .filter((v, i, arr) => v !== '' && arr.indexOf(v) === i)
      if (name && values.length > 0) options.push({ name, values })
    }
    return options
  }

  function readVariantRow(row: HTMLElement) {
    return {
      id: row.dataset.variantId ? Number(row.dataset.variantId) : undefined,
      sku: field<HTMLInputElement>(row, 'sku').value,
      priceEuro: field<HTMLInputElement>(row, 'price').value,
      compareAtEuro: field<HTMLInputElement>(row, 'compareAt').value,
      stock: field<HTMLInputElement>(row, 'stock').value,
    }
  }

  function buildVariantRow(key: string, label: string, preserved?: ReturnType<typeof readVariantRow>): HTMLElement {
    const row = cloneTemplate('variant-row-template')
    row.dataset.key = key
    if (preserved?.id !== undefined) row.dataset.variantId = String(preserved.id)
    row.querySelector<HTMLElement>('[data-field="label"]')!.textContent = label
    field<HTMLInputElement>(row, 'sku').value = preserved?.sku ?? ''
    field<HTMLInputElement>(row, 'price').value = preserved?.priceEuro ?? ''
    field<HTMLInputElement>(row, 'compareAt').value = preserved?.compareAtEuro ?? ''
    field<HTMLInputElement>(row, 'stock').value = preserved?.stock ?? '0'
    return row
  }

  /** Rigenera le righe varianti dal prodotto cartesiano delle opzioni correnti,
   *  preservando i dati già inseriti per le combinazioni ancora presenti. */
  function regenerateVariants(): void {
    const axes = currentOptions().map((option) => option.values)
    const combos = axes.length > 0 ? cartesian(axes) : [[]]

    const existing = new Map<string, ReturnType<typeof readVariantRow>>()
    for (const row of Array.from(variantRows.children) as HTMLElement[]) {
      const key = row.dataset.key ?? ''
      existing.set(key, readVariantRow(row))
    }

    variantRows.innerHTML = ''
    for (const combo of combos) {
      const key = combo.length > 0 ? combo.join(' / ') : DEFAULT_VARIANT_TITLE
      const label = combo.length > 0 ? combo.join(' / ') : DEFAULT_VARIANT_TITLE
      variantRows.appendChild(buildVariantRow(key, label, existing.get(key)))
    }
  }

  regenerateBtn.addEventListener('click', () => regenerateVariants())

  // Seed iniziale delle varianti dai dati del prodotto (o dalla variante unica per un prodotto nuovo).
  for (const variant of initial.variants) {
    const key = variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : DEFAULT_VARIANT_TITLE
    const label = variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : variant.title || DEFAULT_VARIANT_TITLE
    variantRows.appendChild(
      buildVariantRow(key, label, {
        id: variant.id,
        sku: variant.sku,
        priceEuro: variant.priceEuro,
        compareAtEuro: variant.compareAtEuro,
        stock: String(variant.stock),
      })
    )
  }

  /* ---------------------------- Errori di campo -------------------------------- */
  function clearErrors(): void {
    formError.classList.add('hidden')
    formError.textContent = ''
    for (const el of document.querySelectorAll<HTMLElement>('[data-error-for]')) {
      el.textContent = ''
      el.classList.add('hidden')
    }
  }

  function showFieldError(fieldName: string, messages: string[]): void {
    const el = document.querySelector<HTMLElement>(`[data-error-for="${fieldName}"]`)
    if (el) {
      el.textContent = messages.join(' ')
      el.classList.remove('hidden')
    } else {
      formError.textContent = [formError.textContent, `${fieldName}: ${messages.join(' ')}`]
        .filter(Boolean)
        .join(' — ')
      formError.classList.remove('hidden')
    }
  }

  function showFormError(message: string): void {
    formError.textContent = message
    formError.classList.remove('hidden')
  }

  function applyValidationDetails(details: ZodFlatten): void {
    for (const message of details.formErrors ?? []) showFormError(message)
    for (const [key, messages] of Object.entries(details.fieldErrors ?? {})) {
      if (messages && messages.length > 0) showFieldError(key, messages)
    }
  }

  /* ---------------------------- Salvataggio -------------------------------- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    clearErrors()
    saveStatus.textContent = ''

    const images = (Array.from(imageRows.children) as HTMLElement[]).map((row) => ({
      url: field<HTMLInputElement>(row, 'url').value.trim(),
      alt: field<HTMLInputElement>(row, 'alt').value.trim() || null,
    }))

    const options = currentOptions()

    let priceError = false
    const variants = (Array.from(variantRows.children) as HTMLElement[]).map((row) => {
      const priceCents = euroToCents(field<HTMLInputElement>(row, 'price').value)
      const compareAtRaw = field<HTMLInputElement>(row, 'compareAt').value
      const compareAtCents = compareAtRaw.trim() === '' ? null : euroToCents(compareAtRaw)
      if (priceCents === null) priceError = true

      const key = row.dataset.key ?? DEFAULT_VARIANT_TITLE
      const optionValues = key === DEFAULT_VARIANT_TITLE ? [] : key.split(' / ')

      return {
        ...(row.dataset.variantId ? { id: Number(row.dataset.variantId) } : {}),
        sku: field<HTMLInputElement>(row, 'sku').value.trim(),
        title: key,
        priceCents: priceCents ?? 0,
        compareAtCents,
        stock: Number(field<HTMLInputElement>(row, 'stock').value || '0'),
        optionValues,
      }
    })

    if (priceError) {
      showFormError('Controlla i prezzi delle varianti: usa un formato come 29,90.')
      return
    }

    const collectionSlugs = (
      Array.from(form.querySelectorAll<HTMLInputElement>('input[name="collectionSlugs"]:checked'))
    ).map((input) => input.value)

    const payload = {
      slug: slugInput.value.trim(),
      title: titleInput.value.trim(),
      excerpt: (document.getElementById('excerpt') as HTMLInputElement).value.trim() || null,
      description: (document.getElementById('description') as HTMLTextAreaElement).value.trim() || null,
      status: (document.getElementById('status') as HTMLSelectElement).value,
      images,
      options,
      variants,
      collectionSlugs,
    }

    submitButton.disabled = true
    saveStatus.textContent = 'Salvataggio in corso…'

    try {
      const url = mode === 'edit' ? `${API_BASE}/api/admin/products/${productId}` : `${API_BASE}/api/admin/products`
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      const body = text ? JSON.parse(text) : null

      if (!res.ok) {
        const message = body?.error?.message ?? 'Errore durante il salvataggio.'
        const details = body?.error?.details as ZodFlatten | undefined
        if (details) applyValidationDetails(details)
        showFormError(message)
        saveStatus.textContent = ''
        submitButton.disabled = false
        return
      }

      saveStatus.textContent = 'Salvato.'
      window.location.href = '/admin/prodotti'
    } catch {
      showFormError('API non raggiungibile. Riprova.')
      saveStatus.textContent = ''
      submitButton.disabled = false
    }
  })
}
