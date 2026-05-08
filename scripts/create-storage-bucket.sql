-- Create storage bucket for comment images
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-images', 'comment-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comment-images');

-- Allow public read access to images
CREATE POLICY "Public read access for comment images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'comment-images');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'comment-images');
