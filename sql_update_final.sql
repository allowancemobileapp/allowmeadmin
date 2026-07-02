-- 1. Create the new tables for Colleges, Courses, Library Materials, and Quiz Questions
CREATE TABLE IF NOT EXISTS public.colleges (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES public.schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.courses (
    id SERIAL PRIMARY KEY,
    college_id INTEGER REFERENCES public.colleges(id) ON DELETE CASCADE,
    course_code VARCHAR(50) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    course_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.library_materials (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES public.courses(id) ON DELETE CASCADE,
    material_type VARCHAR(50) NOT NULL, -- 'past_question', 'book', 'note'
    title VARCHAR(255),
    academic_year VARCHAR(50),
    semester VARCHAR(50),
    file_url TEXT NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES public.courses(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES public.library_materials(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    correct_option VARCHAR(1) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS) on all new tables
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies to allow public read access for mobile users
-- Mobile users need to fetch this data to see colleges, courses, books, and quizzes.
CREATE POLICY "Public read colleges" ON public.colleges FOR SELECT USING (true);
CREATE POLICY "Public read courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Public read library materials" ON public.library_materials FOR SELECT USING (true);
CREATE POLICY "Public read quiz questions" ON public.quiz_questions FOR SELECT USING (true);

-- 4. Supabase Storage Setup for File Uploads
-- This sets up the 'library-materials' bucket so you can store PDFs and Images.
INSERT INTO storage.buckets (id, name, public) VALUES ('library-materials', 'library-materials', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the bucket
-- Allow public read access to uploaded library materials
CREATE POLICY "Allow public read library-materials"
ON storage.objects FOR SELECT
USING (bucket_id = 'library-materials');

-- Note: The admin panel uploads these files using the backend Service Role Key, 
-- which automatically bypasses RLS on storage inserts, 
-- so we only need a public SELECT policy for users to download/read them.
