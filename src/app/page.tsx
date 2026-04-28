import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function Home() {
  const { data: stars, error } = await supabase.from('stars').select('*')

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui',
      background: '#0a0a0a',
      color: '#e0e0e0',
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>The Between</h1>
      <p style={{ opacity: 0.5, marginBottom: '2rem' }}>thebetween.world</p>

      {error ? (
        <p style={{ color: '#ff6b6b' }}>DB error: {error.message}</p>
      ) : (
        <div style={{
          background: '#1a1a1a',
          borderRadius: '12px',
          padding: '1.5rem 2rem',
          maxWidth: '400px',
          width: '100%',
        }}>
          <p style={{ opacity: 0.4, fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Supabase connected — {stars?.length} star{stars?.length !== 1 ? 's' : ''} found
          </p>
          {stars?.map((star) => (
            <p key={star.id} style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
              "{star.answer}"
            </p>
          ))}
        </div>
      )}
    </main>
  )
}