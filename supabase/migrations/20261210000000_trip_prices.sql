-- Prices a finished shopping trip paid ("trip") are kept with the ones people type in, so the app
-- can tell a deal from a usual price.
alter table public.price_observations drop constraint if exists price_observations_source_check;
alter table public.price_observations add constraint price_observations_source_check
  check (source in ('manual', 'receipt', 'sale', 'live', 'trip'));
