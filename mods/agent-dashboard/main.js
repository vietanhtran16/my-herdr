import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, panes, spaces, theme, run } from "herdr";

const COLUMNS = [
  { key: "blocked", title: "Needs you", hint: "Questions and approvals", empty: "Nothing waiting on you", detail: "Agents that need your input appear here." },
  { key: "working", title: "Working", hint: "Making progress", empty: "All quiet for now", detail: "Agents appear here as soon as they start working." },
  { key: "done", title: "Done", hint: "Finished or ready for a task", empty: "Results will land here", detail: "Completed and idle agents appear here." },
];
const columnOf = (status) => status === "idle" ? "done" : status;
const clean = (title) => (title || "").replace(/^\[ [!.] \] /, "").trim();

export default class AgentDashboard extends View {
  card(agent, t, paneMap, spaceMap) {
    const color = t[columnOf(agent.status)] || t.dim;
    const pane = paneMap.get(agent.pane);
    const space = spaceMap.get(agent.space);
    const name = agent.pane_name || (space?.tabs.find(tab => tab.id === agent.tab)?.named ? agent.tab_name : null) || clean(agent.title) || agent.program?.name || "Agent";
    const status = { blocked: "Needs input", working: "In progress", done: "Finished", idle: "Ready" }[agent.status] || "Ready";
    const program = agent.program;
    const icon = program?.icon ? (program.tint ? svg(program.icon).size(17).text_color(t.foreground) : image(program.icon).w(17).h(17)) : div().text_color(color).child("●");
    return v_flex().id(`dashboard-agent-${agent.address}`).w_full().flex_none()
      .p(16).gap(12).rounded(10).bg(t.background).border(1).border_color(t.border)
      .cursor_pointer().hover(s => s.bg(t.hover).border_color(color))
      .tooltip(`Preview ${name}`)
      .on_click(() => run("terminal.peek", { terminal: agent.address }))
      .child(h_flex().items_center().gap(9)
        .child(icon)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(program?.name || agent.app || "Agent"))
        .child(div().text_size(11).text_color(color).child(status)))
      .child(div().w_full().truncate().text_size(15).font_semibold().text_color(t.foreground).child(name))
      .child(v_flex().gap(5)
        .child(div().truncate().text_size(12).text_color(t.muted).child(agent.space_name || "Workspace"))
        .child(div().truncate().text_size(11).text_color(t.dim).child(pane?.branch || pane?.cwd || space?.folder || agent.address)))
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(10).text_color(t.dim).child(agent.address))
        .child(div().text_size(11).text_color(t.muted).child("Open terminal ↗")));
  }

  column(config, members, t, paneMap, spaceMap) {
    const color = t[config.key];
    return v_flex().flex_1().min_w(0).h_full().min_h(0).bg(t.chrome).rounded(12)
      .border(1).border_color(t.border)
      .child(v_flex().flex_none().p(18).gap(7)
        .child(h_flex().items_center().gap(9)
          .child(div().size(8).rounded(4).bg(color))
          .child(div().flex_1().min_w(0).truncate().text_size(16).font_semibold().text_color(t.foreground).child(config.title))
          .child(div().px(8).py(3).rounded(6).bg(t.raised).text_size(12).text_color(color).child(String(members.length))))
        .child(div().truncate().text_size(11).text_color(t.dim).child(config.hint)))
      .child(v_flex().id(`dashboard-column-${config.key}`).flex_1().min_h(0).px(12).pb(12).gap(10)
        .overflow_y_scrollbar()
        .children(members.map(agent => this.card(agent, t, paneMap, spaceMap)))
        .when(members.length === 0, el => el.child(v_flex().w_full().px(18).py(38).gap(9)
          .child(div().text_size(13).text_color(t.muted).child(config.empty))
          .child(div().text_size(12).text_color(t.dim).child(config.detail)))));
  }

  render() {
    const t = theme();
    const list = [...agents()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.seq - a.seq);
    const paneMap = new Map(panes().map(p => [p.pane, p]));
    const spaceMap = new Map(spaces().map(s => [s.id, s]));
    return v_flex().size_full().min_w(0).min_h(0).p(24).gap(22).bg(t.canvas)
      .child(h_flex().flex_none().items_center().justify_between().gap(12)
        .child(v_flex().gap(6)
          .child(div().text_size(24).font_semibold().text_color(t.foreground).child("Agent dashboard"))
          .child(div().text_size(12).text_color(t.muted).child("All spaces · Live status · Click a card to preview")))
        .child(h_flex().items_center().gap(7)
          .child(div().size(6).rounded(3).bg(t.done))
          .child(div().text_size(12).text_color(t.muted).child(`${list.length} agent${list.length === 1 ? "" : "s"}`))))
      .child(h_flex().flex_1().min_h(0).gap(16).children(COLUMNS.map(config =>
        this.column(config, list.filter(a => columnOf(a.status) === config.key), t, paneMap, spaceMap))));
  }
}
