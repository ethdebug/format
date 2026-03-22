import "./ErrorView.css";

interface ErrorViewProps {
  error: string;
  warnings?: string[];
}

export function ErrorView({ error, warnings }: ErrorViewProps) {
  return (
    <div className="error-view">
      <div className="error-content">
        <h3>Compilation Error</h3>
        <pre className="error-message">{error}</pre>
      </div>

      {warnings && warnings.length > 0 && (
        <div className="error-warnings">
          <h4>Warnings:</h4>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
