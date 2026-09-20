import Nav from './Nav'
import Hero from './Hero'
import { About, Contact, Footer, How, Impact, Why } from './Sections'

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Nav onStart={onStart} />
      <main id="main">
        <Hero onStart={onStart} />
        <About />
        <Why />
        <Impact />
        <How />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
