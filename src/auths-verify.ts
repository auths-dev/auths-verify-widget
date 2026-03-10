import { styles } from './styles';
import { icons } from './icons';
import { STATE_LABELS } from './types';
import type {
  ComponentState,
  DisplayMode,
  BadgeSize,
  VerificationReport,
  ChainLink,
} from './types';
import { ensureInit, verifyAttestation, verifyChain } from './verifier-bridge';
import { truncateDid, statusToState } from './utils';

const DEBOUNCE_MS = 50;

class AuthsVerify extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['attestation', 'attestations', 'public-key', 'mode', 'size', 'wasm-url', 'auto-verify', 'repo', 'forge', 'identity'];
  }

  // --- Private state ---
  #state: ComponentState = 'idle';
  #report: VerificationReport | null = null;
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #detailOpen = false;
  #shadow: ShadowRoot;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  // --- Lifecycle ---

  connectedCallback(): void {
    // Honour initial data-state attribute for static/visual demos
    const initial = this.getAttribute('data-state') as ComponentState | null;
    if (initial && initial !== 'idle') {
      this.#state = initial;
    }
    this.#render();
    if (this.autoVerify && this.#hasInput()) {
      this.#scheduleVerify();
    }
  }

  disconnectedCallback(): void {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'mode' || name === 'size') {
      this.#render();
      return;
    }

    // Data attributes changed — re-verify if auto
    if (this.autoVerify && this.isConnected && this.#hasInput()) {
      this.#scheduleVerify();
    }
  }

  // --- Public attribute properties ---

  get attestation(): string {
    return this.getAttribute('attestation') ?? '';
  }
  set attestation(v: string) {
    this.setAttribute('attestation', v);
  }

  get attestations(): string {
    return this.getAttribute('attestations') ?? '';
  }
  set attestations(v: string) {
    this.setAttribute('attestations', v);
  }

  get publicKey(): string {
    return this.getAttribute('public-key') ?? '';
  }
  set publicKey(v: string) {
    this.setAttribute('public-key', v);
  }

  get mode(): DisplayMode {
    return (this.getAttribute('mode') as DisplayMode) ?? 'badge';
  }
  set mode(v: DisplayMode) {
    this.setAttribute('mode', v);
  }

  get size(): BadgeSize {
    return (this.getAttribute('size') as BadgeSize) ?? 'md';
  }
  set size(v: BadgeSize) {
    this.setAttribute('size', v);
  }

  get wasmUrl(): string {
    return this.getAttribute('wasm-url') ?? '';
  }
  set wasmUrl(v: string) {
    this.setAttribute('wasm-url', v);
  }

  get autoVerify(): boolean {
    return this.getAttribute('auto-verify') !== 'false';
  }
  set autoVerify(v: boolean) {
    if (v) {
      this.removeAttribute('auto-verify');
    } else {
      this.setAttribute('auto-verify', 'false');
    }
  }

  get repo(): string {
    return this.getAttribute('repo') ?? '';
  }
  set repo(v: string) {
    this.setAttribute('repo', v);
  }

  get forge(): string {
    return this.getAttribute('forge') ?? '';
  }
  set forge(v: string) {
    this.setAttribute('forge', v);
  }

  get identity(): string {
    return this.getAttribute('identity') ?? '';
  }
  set identity(v: string) {
    this.setAttribute('identity', v);
  }

  // --- Public API ---

  /** Trigger verification manually. */
  async verify(): Promise<void> {
    if (!this.#hasInput()) {
      this.#setState('error');
      return;
    }

    this.#setState('loading');

    try {
      // If repo is set but attestation data is missing, resolve from forge
      if (this.repo && !this.attestation && !this.attestations) {
        const { resolveFromRepo } = await import('./resolvers/index');
        const result = await resolveFromRepo(
          this.repo,
          this.forge || undefined,
          this.identity || undefined,
        );
        if (!result.bundle) {
          throw new Error(result.error ?? 'Could not resolve identity from repository');
        }
        this.publicKey = result.bundle.public_key_hex;
        this.attestations = JSON.stringify(result.bundle.attestation_chain);
      }

      await ensureInit(this.wasmUrl || undefined);

      const pk = this.publicKey;
      const chainStr = this.attestations;
      const singleStr = this.attestation;

      let report: VerificationReport;

      if (chainStr) {
        // Chain verification
        const chain: (string | object)[] = JSON.parse(chainStr);
        report = await verifyChain(chain, pk);
      } else {
        // Single attestation verification
        const result = await verifyAttestation(singleStr, pk);
        report = {
          status: result.valid ? { type: 'Valid' } : { type: 'BrokenChain', missing_link: result.error ?? 'Unknown error' },
          chain: [],
          warnings: [],
        };
      }

      this.#report = report;
      this.#setState(statusToState(report.status));

      this.dispatchEvent(
        new CustomEvent('auths-verified', {
          bubbles: true,
          composed: true,
          detail: report,
        }),
      );
    } catch (err) {
      this.#report = null;
      this.#setState('error');
      this.dispatchEvent(
        new CustomEvent('auths-error', {
          bubbles: true,
          composed: true,
          detail: { error: err instanceof Error ? err.message : String(err) },
        }),
      );
    }
  }

  /** Get the last verification report, or null if not yet verified. */
  getReport(): VerificationReport | null {
    return this.#report;
  }

  // --- Internals ---

  #hasInput(): boolean {
    return !!(this.repo || (this.publicKey && (this.attestation || this.attestations)));
  }

  #setState(state: ComponentState): void {
    this.#state = state;
    this.setAttribute('data-state', state);
    this.#render();
  }

  #scheduleVerify(): void {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => this.verify(), DEBOUNCE_MS);
  }

  #toggleDetail(): void {
    this.#detailOpen = !this.#detailOpen;
    this.#render();
  }

  #render(): void {
    const state = this.#state;
    const mode = this.mode;
    const label = STATE_LABELS[state];
    const icon = icons[state];

    const badgeTabIndex = mode === 'detail' ? '0' : '-1';
    const ariaExpanded = mode === 'detail' ? String(this.#detailOpen) : undefined;

    let html = `<style>${styles}</style>`;

    if (mode === 'tooltip') {
      html += `<div class="tooltip-wrapper">`;
    }

    html += `
      <span class="badge"
            role="status"
            aria-live="polite"
            tabindex="${badgeTabIndex}"
            ${ariaExpanded !== undefined ? `aria-expanded="${ariaExpanded}"` : ''}>
        ${icon}<span class="label">${label}</span>
      </span>
    `;

    if (mode === 'detail') {
      html += this.#renderDetailPanel();
    }

    if (mode === 'tooltip') {
      html += this.#renderTooltipPanel();
      html += `</div>`;
    }

    this.#shadow.innerHTML = html;

    // Attach event listeners
    if (mode === 'detail') {
      const badge = this.#shadow.querySelector('.badge');
      badge?.addEventListener('click', () => this.#toggleDetail());
      badge?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          this.#toggleDetail();
        }
      });
    }
  }

  #renderDetailPanel(): string {
    const report = this.#report;
    const hidden = !this.#detailOpen;

    let chainRows = '';
    if (report && report.chain.length > 0) {
      chainRows = report.chain
        .map(
          (link: ChainLink) => `
        <tr>
          <td>${truncateDid(link.issuer)}</td>
          <td>${truncateDid(link.subject)}</td>
          <td class="${link.valid ? 'chain-valid' : 'chain-error'}">
            ${link.valid ? 'Valid' : link.error ?? 'Invalid'}
          </td>
        </tr>`,
        )
        .join('');
    }

    let warningsHtml = '';
    if (report && report.warnings.length > 0) {
      warningsHtml = `<ul class="warnings">${report.warnings.map((w: string) => `<li>${w}</li>`).join('')}</ul>`;
    }

    return `
      <div class="detail-panel" aria-hidden="${hidden}">
        ${
          chainRows
            ? `<table>
                <thead><tr><th>Issuer</th><th>Subject</th><th>Status</th></tr></thead>
                <tbody>${chainRows}</tbody>
              </table>`
            : report
              ? `<p>Status: ${report.status.type}</p>`
              : `<p>No verification data</p>`
        }
        ${warningsHtml}
      </div>
    `;
  }

  #renderTooltipPanel(): string {
    const report = this.#report;
    if (!report) return `<div class="tooltip-panel">Not yet verified</div>`;

    const statusText = report.status.type === 'Valid' ? 'Chain verified' : `Status: ${report.status.type}`;
    const chainCount = report.chain.length;

    return `
      <div class="tooltip-panel">
        <strong>${statusText}</strong>
        ${chainCount > 0 ? `<br>${chainCount} link${chainCount > 1 ? 's' : ''} in chain` : ''}
        ${report.warnings.length > 0 ? `<br>${report.warnings.length} warning${report.warnings.length > 1 ? 's' : ''}` : ''}
      </div>
    `;
  }
}

// Register the custom element
if (!customElements.get('auths-verify')) {
  customElements.define('auths-verify', AuthsVerify);
}

export { AuthsVerify };
export type { ComponentState, DisplayMode, BadgeSize, VerificationReport };
