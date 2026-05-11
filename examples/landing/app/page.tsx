import Header from '@/components/Header';
import Hero from '@/components/Hero';
import DogfoodStrip from '@/components/DogfoodStrip';
import AgentView from '@/components/AgentView';
import Problem from '@/components/Problem';
import Fanout from '@/components/Fanout';
import Benchmark from '@/components/Benchmark';
import Install from '@/components/Install';
import Features from '@/components/Features';
import Comparison from '@/components/Comparison';
import DemoStrip from '@/components/DemoStrip';
import Roadmap from '@/components/Roadmap';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';

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
      <Install />
      <Features />
      <Comparison />
      <DemoStrip />
      <Roadmap />
      <CTA />
      <Footer />
    </>
  );
}
