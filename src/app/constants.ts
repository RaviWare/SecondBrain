export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const FAQS = [
  {
    q: 'What is SecondBrain Cloud?',
    a: 'A private AI operating system: a knowledge vault that turns your sources — notes, PDFs, URLs, and transcripts — into cited, connected memory, plus a named squad of always-on AI agents that work that memory for you 24/7. Your agents know your business because they live inside your vault.',
  },
  {
    q: 'How is this different from agent tools like MissionControl or Lindy?',
    a: 'Most agent tools give you a dashboard to watch agents run. SecondBrain gives your agents a brain — your private vault. They don\'t connect to the internet and guess; they work from what you\'ve actually captured and cite every answer back to your own sources. Agents without a brain are just bots.',
  },
  {
    q: 'How is this different from ChatGPT or Notion AI?',
    a: 'ChatGPT does not know your private knowledge and fills gaps with confident guesses. Notion AI bolts AI onto a document editor. SecondBrain is purpose-built for cited recall of your own material, with a squad of named specialist agents that act on it continuously — not just on-demand.',
  },
  {
    q: 'What can the agents actually do?',
    a: 'They run 100+ specialized skills across research, sales, ops, content, finance, and planning — from daily briefings and deal recaps to mission orchestration where a lead agent decomposes a goal and sub-agents execute in parallel. Results are delivered cited to your vault, Telegram, Discord, or email.',
  },
  {
    q: 'Can I name my agents and build a custom squad?',
    a: 'Yes. You pick the archetype (Scout, Synthesist, Critic, Librarian, Researcher, or custom), give them a name (Ranger, Sage, Sentinel, Sherlock — or your own), equip them with skills, and set their schedule. Squad-tier users also get pre-built squad packs like The Brain Trust or The Research Desk.',
  },
  {
    q: 'Do the agents make things up?',
    a: 'No. Every answer is grounded in your vault with source citations. If the brain does not know something, it says so explicitly — honest gap analysis is built in by design. Agents cannot write to your vault without your approval either; every change is a proposal you sign off on.',
  },
  {
    q: 'What can I ingest into SecondBrain?',
    a: 'URLs, plain text, markdown, PDFs, DOCX, and TXT files, plus call transcripts. Drop them in yourself, or let an agent ingest sources for you automatically on a schedule.',
  },
  {
    q: 'What is the Squad tier?',
    a: 'Squad ($99/mo, limited early access) gives you unlimited named autonomous agents, 100+ skills, mission orchestration, agent briefings via Telegram/Discord/WhatsApp, BYO LLM keys (Claude, ChatGPT), a dedicated isolated workspace, and direct founder onboarding. Seats are intentionally capped.',
  },
  {
    q: 'Is my data private and secure?',
    a: 'Yes. Your vault is encrypted, isolated per user, and never used to train any AI model. Agents cannot share your data with third parties, cannot delete pages, and cannot widen their own permissions — these are hard constraints, not settings.',
  },
]
