import {
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  FileText,
  Link2,
  MessageSquareText,
  Network,
  Phone,
  Search,
} from 'lucide-react'

export const dashboardStats = [
  { label: 'Sources', value: 1248, delta: '+23 this week', icon: FileText, tone: 'violet', trend: [6, 9, 7, 12, 10, 15, 18, 23] },
  { label: 'Notes', value: 732, delta: '+18 this week', icon: BookOpen, tone: 'blue', trend: [4, 7, 6, 9, 8, 11, 14, 18] },
  { label: 'Topics', value: 418, delta: '+11 this week', icon: Network, tone: 'green', trend: [3, 5, 4, 6, 5, 8, 9, 11] },
  { label: 'Decisions', value: 156, delta: '+7 this week', icon: CheckCircle2, tone: 'orange', trend: [2, 3, 5, 4, 6, 5, 6, 7] },
  { label: 'AI Answers', value: 87, delta: '+33 this week', icon: Search, tone: 'purple', trend: [5, 8, 12, 10, 18, 22, 28, 33] },
] as const

export const suggestedQuestions = [
  'What did we decide about pricing?',
  'Summarize my GTM strategy',
  'What do my customer calls say about onboarding?',
  'Show research on AI note-taking tools',
]

export const recentActivity = [
  { title: 'Customer Call - Acme Inc.', meta: 'Transcript - 2h ago', icon: Phone, tone: 'green', href: '/app/wiki?source=customer-call-acme' },
  { title: 'Product Strategy v2', meta: 'Document - 5h ago', icon: FileText, tone: 'blue', href: '/app/wiki?source=product-strategy-v2' },
  { title: 'AI in Education - Research Notes', meta: 'Note - Yesterday', icon: MessageSquareText, tone: 'amber', href: '/app/wiki?source=ai-in-education' },
  { title: 'Q2 Planning Decisions', meta: 'Decision - Yesterday', icon: CheckCircle2, tone: 'orange', href: '/app/wiki?type=synthesis' },
  { title: 'Competitive Analysis.pdf', meta: 'PDF - 2 days ago', icon: FileText, tone: 'red', href: '/app/wiki?source=competitive-analysis' },
] as const

export const mostUsedSources = [
  ['Product Strategy v2', '12'],
  ['Customer Call - Acme', '9'],
  ['GTM Plan - Q2', '8'],
  ['AI Trends Report', '7'],
  ['Competitor Matrix', '6'],
] as const

export const topTopics = [
  ['Product Strategy', 28],
  ['Customer Insights', 21],
  ['AI & Tools', 17],
  ['Pricing', 14],
  ['Market Research', 11],
] as const

export const recentDecisions = [
  ['Increase prices for Pro plan', 'May 16'],
  ['Focus on onboarding flow', 'May 15'],
  ['Drop legacy export feature', 'May 14'],
  ['Pilot with 3 design partners', 'May 13'],
  ['Q2 GTM channels locked', 'May 12'],
] as const

export const aiAnswers = [
  ['What is our pricing strategy?', '2h ago'],
  ['Summarize user feedback', '1d ago'],
  ['What did we decide...', '2d ago'],
  ['Key competitor insights', '3d ago'],
  ['Risks mentioned in calls', '4d ago'],
] as const

export const recentSources = [
  { title: 'Q2 Market Research Report.pdf', meta: 'PDF - 12 pages', time: '2h ago', icon: FileText, tone: 'red', href: '/app/wiki?source=q2-market-research-report' },
  { title: 'Customer Call - Beta Co.', meta: 'Transcript - 45 min', time: '5h ago', icon: Phone, tone: 'green', href: '/app/wiki?source=customer-call-beta-co' },
  { title: 'Product Ideas Brainstorm', meta: 'Note', time: 'Yesterday', icon: MessageSquareText, tone: 'amber', href: '/app/wiki?source=product-ideas-brainstorm' },
  { title: 'Founders Weekly Plan - Week 20', meta: 'Document', time: '2 days ago', icon: FileText, tone: 'blue', href: '/app/wiki?source=founders-weekly-plan-week-20' },
  { title: 'AI Tools Landscape 2024', meta: 'Web Link', time: '2 days ago', icon: Link2, tone: 'sky', href: '/app/wiki?source=ai-tools-landscape-2024' },
] as const

export const graphNodes = [
  { label: 'Product Strategy', x: 50, y: 50, size: 'lg', tone: 'purple' },
  { label: 'User Research', x: 58, y: 15, size: 'sm', tone: 'green' },
  { label: 'Roadmap', x: 22, y: 37, size: 'sm', tone: 'sky' },
  { label: 'Customer Calls', x: 82, y: 40, size: 'sm', tone: 'blue' },
  { label: 'Decisions', x: 25, y: 74, size: 'sm', tone: 'orange' },
  { label: 'Competitors', x: 55, y: 82, size: 'sm', tone: 'green' },
  { label: 'Market Research', x: 80, y: 72, size: 'sm', tone: 'violet' },
] as const

export const askActions = [
  { label: 'Cited answers', icon: Bot },
  { label: 'Memory graph', icon: Brain },
  { label: 'Source links', icon: Link2 },
] as const
