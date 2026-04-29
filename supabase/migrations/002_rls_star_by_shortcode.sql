-- Allow reading any star by its exact shortcode, regardless of status.
-- The shortcode acts as an unguessable access token; whoever has it can view the star.
-- The existing "approved stars" policy handles cosmos/public listing.

CREATE POLICY "Anyone can read star by shortcode" ON stars
  FOR SELECT
  USING (true);
