# RapidAPI Instagram Scraper Stable API — Endpoint Reference

## Config
- **Host**: `instagram-scraper-stable-api.p.rapidapi.com`
- **Key**: `9a05d0ce4bmshafdc9ec10bd5d1bp1fee88jsne08a00f6bef3`
- **Plan**: ULTRA (50 req/min)
- **RapidAPI page**: https://rapidapi.com/thetechguy32744/api/instagram-scraper-stable-api

## Key Endpoints (for Competitor Analysis)

### 1. Account Data V2
- **POST** `/ig_get_fb_profile_v3.php`
- Params: `username_or_url` (e.g., "quran")
- Returns: followers, followings, bio, HD profile pic, public email/phone

### 2. User Reels ⭐ (MAIN — for competitor reel scraping)
- **POST** `/get_ig_user_reels.php`
- Params: `username_or_url`, `amount` (default 30), `pagination_token` (empty for first)
- Returns: video links, image links, comment_count, like_count, play_count, like_and_view_counts_disabled

### 3. Detailed Reel Data
- **GET** `/get_media_data.php`
- Params: `reel_post_code_or_url` (e.g., "https://instagram.com/p/DLQAXzKN33c/"), `type` ("reel")
- Returns: play_count, likes, comments count

### 4. Detailed Media Data V2 (with play count)
- **GET** `/get_media_data_v2.php`
- Params: `media_code` (e.g., "DLUWkieNc0u") or `media_id`
- Returns: fb_play_count, ig_play_count, comments count

### 5. Get Post Comments
- **GET** `/get_post_comments.php`
- Params: `media_code`, `sort_order` ("popular"|"recent"), `pagination_token`
- Returns: comments with pagination (needed for reel analysis skill — top_comments input)

### 6. Get Post Comment Replies
- **GET** `/get_post_child_comments.php`
- Params: `post_id`, `comment_id`, `pagination_token`

## Supporting Endpoints

### 7. Basic User + Posts
- **GET** `/ig_get_fb_profile_hover.php`
- Params: `username_or_url`
- Returns: basic account data + latest 3 posts

### 8. User Posts
- **POST** `/get_ig_user_posts.php`
- Returns: thumbnails, video URLs in multiple dimensions

### 9. Search Users/Hashtags
- **POST** `/search_ig.php`
- Params: `search_query`

### 10. User About
- **GET** `/get_ig_user_about.php`
- Params: `username_or_url`
- Returns: Date Joined, Verified Date, Creation Account

### 11. Followers List V2
- **POST** `/get_ig_user_followers_v2.php`
- Params: `username_or_url`, `data` ("followers"), `amount` (max 50), `pagination_token`

### 12. User Similar Accounts
- **GET** `/get_ig_similar_accounts.php`
- Params: `username_or_url`

### 13. User Stories
- **POST** `/get_ig_user_stories.php`
- Params: `username_or_url`

### 14. User Highlights
- **POST** `/get_ig_user_highlights.php`
- Params: `username_or_url`

### 15. User Tagged Posts
- **POST** `/get_ig_user_tagged_posts.php`
- Params: `username_or_url`, `amount`, `pagination_token`

### 16. Posts/Reels by Hashtag
- **GET** `/search_hashtag.php`
- Params: `hashtag`, `pagination_token`

### 17. Get Post Title/Description
- **GET** `/get_reel_title.php`
- Params: `reel_post_code_or_url`, `type` ("post")

### 18. Get Media Code/ID
- **GET** `/media_data_id.php`
- Params: `media_code` or `media_id` (bidirectional lookup)

### 19. Post Likers V2
- **GET** `/get_post_likers.php`
- Params: `post_code`, `pagination_token`

### 20. Are Stories Published
- **POST** `/ig_get_fb_profile.php`
- Params: `username_or_url`, `data` ("has_stories_published")

## Competitor Analysis Workflow

For each competitor account in watchlist:
1. **Account Data V2** → get follower count, avg engagement baseline
2. **User Reels** → get latest reels with play_count, like_count
3. Calculate avg views → identify outliers (1.5x avg)
4. For each outlier:
   a. **Detailed Media Data V2** → get exact play counts
   b. **Get Post Comments** (sort=popular) → get top comments for analysis
   c. Download video → run reel analysis skill via Claude SDK
5. Store results in `crm_reel_analyses` table
