import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { store } from '@/store';
import { antdTheme } from '@/theme/antdTheme';
import { initVoiceController } from '@/services/ai/voiceController';

// The voice controller is a long-lived singleton bound to the store.
initVoiceController(store);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ConfigProvider theme={antdTheme} locale={enUS} componentSize="middle">
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </Provider>
  );
}
