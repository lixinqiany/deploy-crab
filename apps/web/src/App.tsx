import typescriptLogo from '/typescript.svg';
import { Card } from 'antd';
import { Header, Counter } from '@deploy-crab/ui';

export const App = () => (
  <main className="min-h-screen bg-slate-50 px-6 py-12">
    <div className="mx-auto max-w-3xl text-center">
      <div className="mb-8 flex justify-center gap-6">
        <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
          <img src="/vite.svg" className="h-24" alt="Vite logo" />
        </a>
        <a
          href="https://www.typescriptlang.org/"
          target="_blank"
          rel="noreferrer"
        >
          <img src={typescriptLogo} className="h-24" alt="TypeScript logo" />
        </a>
      </div>
      <Header title="Web" />
      <Card className="mx-auto max-w-md">
        <Counter />
      </Card>
    </div>
  </main>
);
