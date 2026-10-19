// Путь: src/data/supabase.ts
// Клиент Supabase. Ключ публичный (publishable): доступ к данным ограничивают правила RLS на сервере, а не секретность ключа.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** Без адреса и ключа (например, при локальной разработке) приложение работает только с локальными данными */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}
