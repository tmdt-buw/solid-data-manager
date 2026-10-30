import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import App from './App';
import session from './solidSession';
jest.mock('./solidSession', () => ({ __esModule: true, default: { info: { isLoggedIn: false }, login: jest.fn(async () => {}) } }));
jest.mock('./components/LoginScreen', () => ({ onLogin }) => <button onClick={() => onLogin('https://issuer.example')}>Test login</button>);
jest.mock('./components/DataManager', () => () => null);
jest.mock('./components/FooterBar', () => () => null);
test('the standalone login sends the requested file as part of the OAuth return URL', async () => {
  const target = 'https://storage.example/alice/file.csv';
  history.replaceState(null, '', '/solid-data-manager/?lang=de&uri=' + encodeURIComponent(target));
  render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Test login' }));
  await waitFor(() => expect(session.login).toHaveBeenCalled());
  const options = session.login.mock.calls[0][0];
  expect(options.oidcIssuer).toBe('https://issuer.example');
  expect(new URL(options.redirectUrl).searchParams.get('uri')).toBe(target);
  expect(new URL(options.redirectUrl).searchParams.get('lang')).toBe('de');
});
