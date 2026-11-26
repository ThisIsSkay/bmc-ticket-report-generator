import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { name: string; children: ReactNode }
interface State { error: Error | null }

// Keeps a crash inside one section: the tool bar and the other sections stay
// usable, and the user gets a way to retry instead of a blank page.
export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} stopped working`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="tool-error" role="alert">
        <h2>{this.props.name} stopped working</h2>
        <p>The other sections still work. Reloading the page usually fixes this; files you loaded in this section will need to be loaded again.</p>
        <p className="tool-error-detail">{this.state.error.message}</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
      </div>
    )
  }
}
