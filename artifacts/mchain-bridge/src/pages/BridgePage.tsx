import { TopBar } from '../components/TopBar';
import { BridgeWidget } from '../components/BridgeWidget';
import { TxHistory } from '../components/TxHistory';

export default function BridgePage() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background selection:bg-primary/30">
      <TopBar />
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg mt-8 mb-12">
          <BridgeWidget />
          <TxHistory />
        </div>
      </main>
    </div>
  );
}
