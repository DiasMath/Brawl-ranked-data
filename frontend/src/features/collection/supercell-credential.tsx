import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { dateTime } from '@/lib/data';
import { collectionRequest } from '@/lib/live';

type CredentialStatus = {
  environment: 'development' | 'production';
  configured: boolean;
  encryption_configured: boolean;
  updated_at: string | null;
};

const endpoint = '/api/supercell/credential';

export function SupercellCredential({ onSaved }: { onSaved: () => void }) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void collectionRequest<CredentialStatus>(endpoint, { signal: controller.signal })
      .then(setStatus)
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);

  return <section className="card account-card">
    <div className="card-head"><div><h2><KeyRound size={17}/> Chave da Supercell</h2>
      <p>{status ? `Ambiente de ${status.environment === 'development' ? 'desenvolvimento' : 'produção'}` : 'Configuração da coleta'}</p>
    </div>{status?.configured && <span className="tag confirmed">Cadastrada</span>}</div>
    {status?.updated_at && <p className="section-note">Última troca em {dateTime(status.updated_at)}</p>}
    {status && !status.encryption_configured && <p className="section-note error">Configure BRAWL_CREDENTIAL_KEY no backend para habilitar o cadastro.</p>}
    {status?.encryption_configured && <form className="form-grid tracked-account-form" autoComplete="off" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const token = String(new FormData(form).get('token') ?? '').trim();
      setError('');
      setSaved(false);
      setSaving(true);
      try {
        const result = await collectionRequest<CredentialStatus>(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
        });
        form.reset();
        setStatus(result);
        setSaved(true);
        onSaved();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Falha ao validar a chave.');
      } finally {
        setSaving(false);
      }
    }}>
      <label>{status.configured ? 'Nova chave' : 'Chave de API'}
        <input name="token" type="password" autoComplete="new-password" maxLength={4096} required disabled={saving}/>
      </label>
      <div className="actions"><button className="button primary" disabled={saving}>
        {saving ? 'Validando com a Supercell…' : 'Validar e salvar'}
      </button></div>
    </form>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    {saved && <p className="feedback" role="status">Chave validada e salva.</p>}
  </section>;
}
