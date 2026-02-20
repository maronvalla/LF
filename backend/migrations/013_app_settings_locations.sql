CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES (
  'locations',
  jsonb_build_object(
    'local', jsonb_build_object(
      'address', 'Avenida Mitre 831, Aguilares',
      'lat', -27.432028,
      'lng', -65.616528
    ),
    'deposito', jsonb_build_object(
      'address', 'Avenida Mitre 831, Aguilares',
      'lat', -27.432028,
      'lng', -65.616528
    ),
    'extras', '[]'::jsonb
  )
)
ON CONFLICT (key) DO NOTHING;
