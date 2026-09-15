import Workspace from "./workspace";
import { salesReadOnlyPreview } from "../lib/sales-preview";
export default function Page() { return <Workspace salesReadOnly={salesReadOnlyPreview()} />; }
