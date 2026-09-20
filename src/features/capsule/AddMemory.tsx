import { Upload } from 'lucide-react'
import { useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { Button, ErrorView, Field, inputCls, Sheet } from '../../components/ui'
import { useSettings } from '../../state/settings'

/** Upload a photo, voice recording, video or written message into a Time Capsule. */
export default function AddMemory({ open, onClose, onSaved, patientId }: { open: boolean; onClose: () => void; onSaved: () => void; patientId?: number }) {
  const { t } = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (patientId) fd.set('patientId', String(patientId))
    if (!(fd.get('file') as File)?.size) fd.delete('file')
    setBusy(true)
    try {
      await api.post('/memories', fd)
      onSaved()
      onClose()
      setPreview(null)
      setError(null)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('capsule.add')}>
      <form onSubmit={submit} className="space-y-5">
        <Field label={t('capsule.file')} hint={t('capsule.fileHint')}>
          <input name="file" type="file" accept="image/*,audio/*,video/*" className={`${inputCls} py-3`}
            onChange={(e) => { const f = e.target.files?.[0]; setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null) }} />
        </Field>
        {preview && <img src={preview} alt="" className="max-h-56 rounded-2xl object-contain" />}
        <Field label={t('capsule.titleField')}><input name="title" required maxLength={120} className={inputCls} placeholder={t('capsule.titlePh')} /></Field>
        <Field label={t('capsule.people')} hint={t('capsule.peopleHint')}><input name="people" maxLength={200} className={inputCls} /></Field>
        <Field label={t('capsule.place')}><input name="place" maxLength={120} className={inputCls} /></Field>
        <Field label={t('capsule.when')}><input name="happenedOn" type="date" className={inputCls} /></Field>
        <Field label={t('capsule.story')} hint={t('capsule.storyHint')}><textarea name="description" rows={4} maxLength={2000} className={`${inputCls} py-3`} /></Field>
        {error && <ErrorView error={error} />}
        <Button big busy={busy} className="w-full"><Upload aria-hidden /> {t('capsule.save')}</Button>
      </form>
    </Sheet>
  )
}
