require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

const sql = `
-- 1. Create the function that will handle the data sync
CREATE OR REPLACE FUNCTION sync_approved_submission()
RETURNS TRIGGER AS $$
DECLARE
    item jsonb;
    v_meal_id integer;
    v_signature text;
BEGIN
    -- Only trigger when status changes to 'approved'
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        
        -- ==============================================
        -- 1. HANDLE FOOD MENU SYNC
        -- ==============================================
        IF NEW.submission_type = 'food-menu' THEN
            -- Loop through each item in the items array
            FOR item IN SELECT * FROM jsonb_array_elements(NEW.details->'items')
            LOOP
                -- Check if the meal already exists in the meals table
                SELECT id INTO v_meal_id FROM public.meals 
                WHERE name = item->>'item_name' 
                AND section_id = (item->>'section_id')::integer 
                AND category_id = (item->>'category_id')::integer
                LIMIT 1;
                
                -- If the meal doesn't exist, create it first
                IF v_meal_id IS NULL THEN
                    INSERT INTO public.meals (name, section_id, category_id, calorie_count)
                    VALUES (
                        item->>'item_name', 
                        (item->>'section_id')::integer, 
                        (item->>'category_id')::integer, 
                        COALESCE((item->>'calorie_count')::numeric, 0)
                    ) RETURNING id INTO v_meal_id;
                END IF;

                -- Insert the mapped item into vendor_menus
                INSERT INTO public.vendor_menus (vendor_id, meal_id, quantity_portion, price)
                VALUES (
                    (NEW.details->>'vendor_id')::integer,
                    v_meal_id,
                    COALESCE(item->>'portions_per_pack', '1'),
                    (item->>'price')::numeric
                );
            END LOOP;
            
        -- ==============================================
        -- 2. HANDLE FOOD COMBO SYNC
        -- ==============================================
        ELSIF NEW.submission_type = 'food-combo' THEN
            -- Construct the signature dynamically exactly like the JS frontend does
            SELECT string_agg(
                COALESCE(i->>'category', '') || ':' || COALESCE(i->>'name', '') || ',' || COALESCE(i->>'portion', COALESCE(i->>'quantity', '1')), 
                '|'
            ) INTO v_signature
            FROM (
                SELECT i FROM jsonb_array_elements(NEW.details->'items') AS i
                ORDER BY (COALESCE(i->>'category', '') || ':' || COALESCE(i->>'name', '') || ',' || COALESCE(i->>'portion', COALESCE(i->>'quantity', '1')))
            ) AS sorted_items;

            -- Append Pack if specified
            IF (NEW.details->>'has_pack')::boolean THEN
                v_signature := v_signature || '|Pack';
            END IF;

            -- Fallback signature if mapping fails
            IF v_signature IS NULL OR v_signature = '' THEN
                v_signature := 'auto-' || (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text;
            END IF;

            -- Insert the combo into the options table
            INSERT INTO public.options (vendor_id, combo_description, total_price, total_calories, items, signature)
            VALUES (
                (NEW.details->>'vendor_id')::integer,
                COALESCE(NEW.details->>'combo_name', 'Combo'),
                COALESCE((NEW.details->>'total_price')::numeric, 0),
                COALESCE((NEW.details->>'total_calories')::integer, 0),
                NEW.details->'items',
                v_signature
            );
            
        -- ==============================================
        -- 3. HANDLE LIBRARY MATERIAL SYNC
        -- ==============================================
        ELSIF NEW.submission_type = 'library' THEN
            -- Insert the approved library material
            INSERT INTO public.library_materials (
                course_id, 
                material_type, 
                title, 
                academic_year, 
                semester, 
                file_url, 
                price
            )
            VALUES (
                (NEW.details->>'course_id')::integer,
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

-- 2. Attach the trigger to feed_submissions table
DROP TRIGGER IF EXISTS trigger_sync_approved_submission ON public.feed_submissions;
CREATE TRIGGER trigger_sync_approved_submission
AFTER UPDATE OF status ON public.feed_submissions
FOR EACH ROW
EXECUTE FUNCTION sync_approved_submission();
`;

pool.query(sql)
  .then(() => {
    console.log('Trigger successfully applied!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error applying trigger:', err);
    process.exit(1);
  });
