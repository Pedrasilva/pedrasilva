DO $$
DECLARE
  bath uuid;
  fam uuid;
  rec record;
  t text;
  i int;
BEGIN
  SELECT id INTO bath FROM public.product_categories WHERE parent_id IS NULL AND name = 'Bathroom';
  IF bath IS NULL THEN
    INSERT INTO public.product_categories (parent_id, name, sort_order, active)
    VALUES (NULL, 'Bathroom', 3, true) RETURNING id INTO bath;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Sanitaryware', 1, ARRAY['Washbasins','Handrinse Basins','Toilets / WCs','Bidets','Urinals','Toilet Seats']),
      ('Showers & Baths', 2, ARRAY['Bathtubs','Shower Trays','Shower Enclosures / Cabins','Shower Panels','Bath Panels','Shower Channels / Drains']),
      ('Taps & Shower Fittings', 3, ARRAY['Basin Taps / Mixers','Bidet Taps','Bath Taps / Mixers','Shower Taps / Mixers','Overhead Showers','Hand Showers','Side / Body Showers','Shower Columns / Systems']),
      ('Bathroom Furniture', 4, ARRAY['Vanity Units','Bathroom Cabinets','Washbasin Countertops','Bathroom Mirrors','Wall Shelves','Bathroom Benches','Bathroom Stools','Bathroom Furniture Sets']),
      ('Bathroom Accessories', 5, ARRAY['Towel Rails / Holders','Toilet Roll Holders','Soap Dispensers / Dishes','Toilet Brushes','Bathroom Shelves','Hooks','Grab Rails','Bathroom Accessory Sets','Other Accessories']),
      ('Bathroom Lighting', 6, ARRAY['Wall Lights','Ceiling Lights','Mirror Lights','Mirrors with Integrated Lighting']),
      ('Accessibility', 7, ARRAY['Accessible WCs','Accessible Washbasins','Grab Rails','Accessible Shower Seats','Accessible Bathroom Accessories']),
      ('Wellness', 8, ARRAY['Saunas','Steam Rooms','Hammams','Whirlpool Baths','Wellness Showers'])
    ) AS v(fam_name, fam_order, types)
  LOOP
    SELECT id INTO fam FROM public.product_categories WHERE parent_id = bath AND name = rec.fam_name;
    IF fam IS NULL THEN
      INSERT INTO public.product_categories (parent_id, name, sort_order, active)
      VALUES (bath, rec.fam_name, rec.fam_order, true) RETURNING id INTO fam;
    END IF;

    i := 0;
    FOREACH t IN ARRAY rec.types LOOP
      i := i + 1;
      IF NOT EXISTS (SELECT 1 FROM public.product_categories WHERE parent_id = fam AND name = t) THEN
        INSERT INTO public.product_categories (parent_id, name, sort_order, active)
        VALUES (fam, t, i, true);
      END IF;
    END LOOP;
  END LOOP;
END $$;