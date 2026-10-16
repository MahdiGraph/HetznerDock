// The parts of noVNC's RFB class the console uses. noVNC ships no type definitions.
declare module "@novnc/novnc" {
  export type RfbCredentials = { username?: string; password?: string; target?: string }

  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      urlOrChannel: string,
      options?: { shared?: boolean; credentials?: RfbCredentials; wsProtocols?: string[] }
    )
    background: string
    scaleViewport: boolean
    clipViewport: boolean
    resizeSession: boolean
    viewOnly: boolean
    focusOnClick: boolean
    qualityLevel: number
    compressionLevel: number
    disconnect(): void
    focus(): void
    blur(): void
    sendCredentials(credentials: RfbCredentials): void
    sendCtrlAltDel(): void
    sendKey(keysym: number, code: string | null, down?: boolean): void
  }
}
