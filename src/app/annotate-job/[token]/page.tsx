"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { AnnotationJobView } from "@/components/human-labelling/AnnotationJobView";

export default function AnnotateJobPage() {
  const params = useParams();
  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
        ? params.token[0]
        : "";

  useEffect(() => {
    document.title = "Annotate | Calibrate";
  }, []);

  return <AnnotationJobView token={token} mode="public" />;
}
