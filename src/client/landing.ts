import "./styles.css";
import { mount } from "svelte";
import Landing from "./Landing.svelte";

const target = document.getElementById("landing-root");
if (!target) {
  throw new Error("Missing #landing-root mount node");
}

const landing = mount(Landing, { target });

export default landing;
