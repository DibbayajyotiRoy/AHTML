import Header from '@/components/Header';
import Hero from '@/components/Hero';
import DogfoodStrip from '@/components/DogfoodStrip';
import AgentView from '@/components/AgentView';
import Problem from '@/components/Problem';
import Fanout from '@/components/Fanout';
import Benchmark from '@/components/Benchmark';
import Packages from '@/components/Packages';
import Quickstart from '@/components/Quickstart';
import Features from '@/components/Features';
import Comparison from '@/components/Comparison';
import DemoStrip from '@/components/DemoStrip';
import FAQ from '@/components/FAQ';
import Roadmap from '@/components/Roadmap';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';
import MadeByBadge from '@/components/MadeByBadge';

export default function Page() {
  return (
    <>
      <Header />
      <Hero />
      <DogfoodStrip />
      <AgentView />
      <Problem />
      <Fanout />
      <Benchmark />
      <Packages />
      <Quickstart />
      <Features />
      <Comparison />
      <DemoStrip />
      <FAQ />
      <Roadmap />
      <CTA />
      <Footer />
      <MadeByBadge />
    </>
  );
}
