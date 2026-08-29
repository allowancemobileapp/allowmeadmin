require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

const sql = `
CREATE OR REPLACE FUNCTION sync_approved_submission()
RETURNS TRIGGER AS $$
DECLARE
    item jsonb;
    v_meal_id integer;
    v_signature text;
    v_new_items jsonb := '[]'::jsonb;
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        
        IF NEW.submission_type = 'food-menu' THEN
            FOR item IN SELECT * FROM jsonb_array_elements(NEW.details->'items')
            LOOP
                SELECT id INTO v_meal_id FROM public.meals 
                WHERE name = item->>'item_name' 
                AND section_id = (item->>'section_id')::numeric::integer 
                AND category_id = (item->>'category_id')::numeric::integer
                LIMIT 1;
                
                IF v_meal_id IS NULL THEN
                    INSERT INTO public.meals (name, section_id, category_id, calorie_count)
                    VALUES (
                        item->>'item_name', 
                        (item->>'section_id')::numeric::integer, 
                        (item->>'category_id')::numeric::integer, 
                        COALESCE((item->>'calorie_count')::numeric, 0)
                    ) RETURNING id INTO v_meal_id;
                END IF;

                INSERT INTO public.vendor_menus (vendor_id, meal_id, quantity_portion, price)
                VALUES (
                    (NEW.details->>'vendor_id')::numeric::integer,
                    v_meal_id,
                    COALESCE(item->>'portions_per_pack', '1'),
                    (item->>'price')::numeric
                );
            END LOOP;
            
        ELSIF NEW.submission_type = 'food-combo' THEN
            -- Generate signature correctly
            SELECT string_agg(
                COALESCE(i->>'category', '') || ':' || COALESCE(i->>'name', '') || ',' || COALESCE(i->>'portion', COALESCE(i->>'quantity', '1')), 
                '|'
            ) INTO v_signature
            FROM (
                SELECT i FROM jsonb_array_elements(NEW.details->'items') AS i
                ORDER BY (COALESCE(i->>'category', '') || ':' || COALESCE(i->>'name', '') || ',' || COALESCE(i->>'portion', COALESCE(i->>'quantity', '1')))
            ) AS sorted_items;

            IF (NEW.details->>'has_pack')::boolean THEN
                IF v_signature IS NOT NULL AND v_signature != '' THEN
                    v_signature := v_signature || '|Pack';
                ELSE
                    v_signature := 'Pack';
                END IF;
            END IF;

            -- Build new items array with meal_id
            FOR item IN SELECT * FROM jsonb_array_elements(NEW.details->'items')
            LOOP
                SELECT id INTO v_meal_id FROM public.meals WHERE name = item->>'name' LIMIT 1;
                item := jsonb_set(item, '{meal_id}', COALESCE(to_jsonb(v_meal_id), 'null'::jsonb));
                v_new_items := v_new_items || item;
            END LOOP;

            IF (NEW.details->>'has_pack')::boolean THEN
                v_new_items := v_new_items || '{"name": "Pack", "category": "packaging", "price": 200, "quantity": 1, "portion": null, "meal_id": 0}'::jsonb;
            END IF;

            INSERT INTO public.options (vendor_id, combo_description, total_price, total_calories, items, signature)
            VALUES (
                (NEW.details->>'vendor_id')::numeric::integer,
                COALESCE(NEW.details->>'combo_name', NEW.details->>'items_description', 'Combo'),
                COALESCE((NEW.details->>'total_price')::numeric, 0),
                COALESCE(ROUND((NEW.details->>'total_calories')::numeric), 0)::integer,
                v_new_items,
                v_signature
            );
            
        ELSIF NEW.submission_type = 'library' THEN
            INSERT INTO public.library_materials (
                course_id, material_type, title, academic_year, semester, file_url, price
            )
            VALUES (
                (NEW.details->>'course_id')::numeric::integer,
                NEW.details->>'material_type',
                NEW.details->>'title',
                NEW.details->>'academic_year',
                NEW.details->>'semester',
                NEW.evidence_url,
                COALESCE((NEW.details->>'price')::numeric, 0)
            );
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

pool.query(sql)
  .then(() => {
    console.log('Trigger successfully updated!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error applying trigger:', err);
    process.exit(1);
  });
