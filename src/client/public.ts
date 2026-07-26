import "./styles.css";
import { mount } from "svelte";
import PublicSite from "./PublicSite.svelte";

const target = document.getElementById("public-root");
if (!target) {
  throw new Error("Missing #public-root mount node");
}

mount(PublicSite, { target });
