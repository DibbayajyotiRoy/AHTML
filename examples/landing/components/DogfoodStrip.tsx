export default function DogfoodStrip() {
  return (
    <div className="dogfood">
      <div className="container">
        <span className="label">This page also serves</span>
        <a href="/ahtml">/ahtml (compact)</a>
        <a href="/ahtml?fmt=json">/ahtml (json)</a>
        <a href="/ahtml/mcp.json">/ahtml/mcp.json</a>
        <a href="/ahtml/openapi.json">/ahtml/openapi.json</a>
        <a href="/llms.txt">/llms.txt</a>
        <a href="/.well-known/ahtml.json">/.well-known/ahtml.json</a>
      </div>
    </div>
  );
}
