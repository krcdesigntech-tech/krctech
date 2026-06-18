-- Remove the async bot worker queue. 봇은 동기식 법령 Q&A(/api/legal/ask)로 대체된다.
DROP TABLE IF EXISTS public.bot_questions CASCADE;
