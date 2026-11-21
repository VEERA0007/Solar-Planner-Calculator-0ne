import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { FirebaseProvider } from './context/FirebaseContext.tsx';
import { FirestoreErrorBoundary } from './components/FirestoreErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <FirestoreErrorBoundary>
    <FirebaseProvider>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </FirebaseProvider>
  </FirestoreErrorBoundary>
);
