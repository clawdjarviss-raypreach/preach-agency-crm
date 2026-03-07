# Skill: Reel Analysis

You analyze Instagram Reels and produce a structured analysis. Your output helps content creators understand WHY a reel works and what makes it reproducible.

## Inputs

You receive:
- `reel_id` — The reel identifier
- `video_url` — Direct URL to the video file
- `temp_prefix` — Unique temp path prefix (e.g., `/tmp/reel_a1b2c3d4`)
- `metrics` — Object with: views, likes, comments, shares, duration, caption, share_rate, like_rate, username, followers, avg_views, outlier_multiplier
- `top_comments` — Array of top comments (text + like count)

## Step 1: Download & Extract Frames

Download the video and extract frames at 3fps using the provided temp prefix:

```bash
curl -sL "{video_url}" -o "{temp_prefix}.mp4"
ffmpeg -y -i "{temp_prefix}.mp4" -vf "fps=3" -q:v 2 "{temp_prefix}_frame_%03d.jpg"
```

## Step 2: Visual Analysis

Read 5 evenly-spaced key frames using the Read tool. For a 5s reel (15 frames), read frames 1, 4, 8, 12, 15. For shorter/longer reels, adjust proportionally.

When viewing each frame, identify:

**First frame specifically:**
- What is the FIRST thing you see? This is the hook element.
- Is it visual shock, curiosity, or pattern interrupt?

**All frames — build a detail inventory:**
- People: How many, what they're wearing (uniforms, brands, specific clothing), what they're doing, body language, facial expressions
- Props: Every object visible (hats, drinks, phones, accessories, signs, vehicles, furniture)
- Setting: Where is this? Indoor/outdoor, specific location markers (signs, landmarks, business names)
- Text overlays: Any on-screen text, captions, watermarks
- POV/Framing: Camera angle (dashboard POV, selfie, third-person, surveillance-style), what perspective the viewer is placed in
- Changes between frames: What moves, what appears/disappears, what's the progression

## Step 3: Analyze Comments

Scan top comments to identify:
- What people react to most (the triggers)
- Whether there's a "real or fake?" debate
- Political/controversial reactions
- Thirst/attraction comments
- Humor/meme reactions
- Disagreements or arguments in replies

These reveal the **engagement triggers** — what makes people comment, share, or save.

## Step 4: Synthesize Analysis

Combine visual analysis, metrics, and comment signals into a structured analysis.

### Writing Rules

- **hook**: Name the SPECIFIC visual element (e.g., "bare foot on steering wheel" not "unusual visual"). Explain the psychological mechanism in 3-5 words (e.g., "taboo shock + voyeur POV"). Max 1-2 sentences.
- **retention**: Identify the mechanic — is it a reveal, escalation, curiosity gap, single-scene tension, loop bait? Max 1-2 sentences.
- **pattern_name**: Short descriptive name for the pattern, 2-4 words (e.g., "Intimate POV Question", "Taboo Uniform Shock", "Vulnerable Breakdown CTA").
- **pattern_formula**: Write as a formula that someone could use to recreate the concept with different characters/settings. 3-5 elements separated by " + " (e.g., "Intimate Morning GF POV + Suggestive Question + Low-Cut Sleep Outfit + Cozy Setting + Comment CTA").
- **triggers**: These come from BOTH visual analysis AND comment analysis. Be specific ("MAGA controversy" not "political content").
- **props**: List EVERYTHING visible. This is the reproduction checklist. Include clothing items, accessories, background objects, vehicles, signs, text.
- **difficulty**: 1 = single static image with text. 2 = single scene, one character, minimal props. 3 = single scene, multiple props, specific framing. 4 = multi-scene or complex choreography. 5 = multi-scene with transitions, multiple characters, complex production.
- **difficulty_note**: Brief reason for the difficulty rating, max 10 words.
- **performance_analysis**: Be analytical, 2-3 sentences max. Connect specific content elements to specific metrics. Reference specific comments if they reveal something about virality. Example: "Share rate 0.47% is 2.6x account avg — political controversy makes it forward-worthy as reaction/meme."

## Output Format

Return a valid JSON object with these exact fields:

```json
{
  "hook": "Deep V-neck sleep shirt in cozy cabin kitchen — intimate morning GF fantasy stops scroll",
  "retention": "Suggestive question builds across captions, direct comment CTA at end",
  "pattern_name": "Intimate Morning GF POV",
  "pattern_formula": "Intimate Morning GF POV + Suggestive Question + Low-Cut Sleep Outfit + Cozy Setting + Comment CTA",
  "triggers": ["Deep cleavage visual", "GF experience", "Suggestive double-meaning", "German niche", "Comment bait CTA", "Cozy cabin aesthetic"],
  "props": ["Grey sleep shirt (deep V)", "Coffee mug", "Espresso cup on saucer", "Coffee beans on burlap", "Wooden cabin ceiling", "Moka pot", "Washing machine"],
  "difficulty": 2,
  "difficulty_note": "Single scene, one character, static kitchen",
  "performance_analysis": "68x Follower-Multiplier — German 'GF morning' format in underserved niche. Top comment with 59 likes is direct flirt response. Deutsch = less AI competition, higher engagement per view."
}
```

Return ONLY the JSON object. No intro text, no markdown formatting, no code fences. Just the raw JSON.

## Cleanup

After outputting the JSON, delete temporary files:

```bash
rm -f {temp_prefix}.mp4 {temp_prefix}_frame_*.jpg
```
