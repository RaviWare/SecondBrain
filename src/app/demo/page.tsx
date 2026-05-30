import { redirect } from 'next/navigation'

// The interactive demo lives inline on the home page (#see-it). Keep this route
// as a redirect so any old links/bookmarks still land on the showcase.
export default function DemoRedirect() {
  redirect('/#see-it')
}
