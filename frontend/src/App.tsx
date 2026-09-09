import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { HomePage } from "./pages/HomePage";
import { DocumentTypesListPage } from "./pages/DocumentTypesListPage";
import { DocumentTypeConfigPage } from "./pages/DocumentTypeConfigPage";
import { WorkflowsListPage } from "./pages/WorkflowsListPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowExecutionPage } from "./pages/WorkflowExecutionPage";
import { ReviewPage } from "./pages/ReviewPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/tipos-documento" element={<DocumentTypesListPage />} />
        <Route path="/tipos-documento/nuevo" element={<DocumentTypeConfigPage />} />
        <Route path="/tipos-documento/:id" element={<DocumentTypeConfigPage />} />
        <Route path="/workflows" element={<WorkflowsListPage />} />
        <Route path="/workflows/nuevo" element={<WorkflowEditorPage />} />
        <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
        <Route
          path="/workflows/:workflowId/ejecuciones/:executionId"
          element={<WorkflowExecutionPage />}
        />
        <Route path="/revision" element={<ReviewPage />} />
      </Route>
    </Routes>
  );
}
