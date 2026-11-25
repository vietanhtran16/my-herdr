import { diffEntries, deferredReason, lexicalBlock } from "./diff-model.js";
import { highlightRows, wrapTokens, syntaxColor } from "./syntax.js";
import { View, div, list } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView, Scrollbar } from "gpui-base";
import { appHome, exec, checking, theme, window, settings } from "herdr";

export default class PRReview extends View {
  init(_props, cx) {
    this.url = InputState.new({value: localStorage.getItem("url") || "https://github.com/ctxpipe-ai/ctxpipe/pull/1100", placeholder: "GitHub PR URL"});
    this.question = TextareaState.new({value: localStorage.getItem("draft") || "", placeholder: "Ask about the PR, group, or selected line…", rows: 3});
    this.question.on("change", () => localStorage.setItem("draft", this.question.value()));
    this.url.on("submit", (_e, cx) => this.open(cx));
    this.provider = localStorage.getItem("provider") || "codex";
    this.section = "changes";
    this.diffStyle = localStorage.getItem("diffStyle") === "stacked" ? "stacked" : "split";
    this.expanded = new Set(); this.focusedFile = null; this.loadedFiles = new Set(); this.fileDiffs = {}; this.contexts = {}; this.target = null;
    this.contentWidth = 1000; this.contentHeight = 400; this.pointerSide = "RIGHT";
    this.busy = false; this.error = ""; this.data = null; this.history = [];
    if (checking()) return;
    this.call("history", {}, cx, (data, cx) => { this.history = data; this.open(cx); });
    cx.timer.every(2500, cx => {
      if (window()?.visible && !this.busy && this.data?.jobs.some(j => j.status === "running")) this.call("get", {}, cx);
    });
  }

  call(action, args, cx, done) {
    if (this.busy) return;
    this.busy = true; this.error = "";
    const url = this.activeUrl || this.url.value().trim();
    cx.spawn(async cx => {
      try {
        const result = await exec("python3", [appHome() + "/mods/pr-review/backend.py", JSON.stringify({action, url, provider: this.provider, ...args})], {timeout: 120000});
        if (result.code !== 0) throw new Error(result.stderr || "Backend failed");
        const response = JSON.parse(result.stdout);
        if (!response.ok) throw new Error(response.error);
        this.busy = false;
        if (done) done(response.data, cx);
        else {
          if (this.data?.snapshot?.base !== response.data.snapshot?.base || this.data?.snapshot?.head !== response.data.snapshot?.head) { this.contexts = {}; this.loadedFiles.clear(); this.fileDiffs = {}; this.focusedFile = null; }
          this.data = response.data;
        }
      } catch (error) { this.busy = false; this.error = String(error.message || error); }
      cx.notify();
    });
    cx.notify();
  }

  open(cx) {
    if (this.busy) return;
    this.activeUrl = this.url.value().trim();
    localStorage.setItem("url", this.activeUrl);
    this.data = null; this.target = null; this.expanded.clear(); this.contexts = {}; this.loadedFiles.clear(); this.fileDiffs = {}; this.focusedFile = null;
    this.call("get", {}, cx);
  }

  button(id, text, action, active = false) {
    const t = theme();
    return div().id(id).flex_none().cursor_pointer().px(10).py(6).rounded(5).bg(active ? t.selected : t.raised)
      .text_color(active ? t.accent : t.foreground).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => action(cx)).child(text);
  }

  markdown(id, text) {
    return TextView.markdown(id, String(text || "")).raw_html(false).selectable(true).scrollable(false);
  }

  card(id, label, body, color) {
    const t = theme();
    return v_flex().id(id).flex_none().min_w(0).p(12).gap(6).bg(t.surface).border(1).border_color(color || t.border).rounded(6)
      .child(div().font_semibold().text_color(color || t.muted).child(label)).child(this.markdown(id + "-body", body));
  }

  select(target, cx) { this.target = target; this.question.focus(); cx.notify(); }

  expandContext(h, direction, cx) {
    const current = this.contexts[h.id] || {above: [], below: []};
    const counts = {above: current.above.length, below: current.below.length};
    counts[direction] = Math.min(1000, counts[direction] + 20);
    const {base, head} = this.data.snapshot;
    this.call("context", {hunk: h.id, base, head, ...counts}, cx, result => { this.contexts[h.id] = result; });
  }

  codeLine(tokens, size) {
    const t = theme();
    return h_flex().h(Math.ceil(size * 1.8)).flex_none().whitespace_nowrap()
      .children(tokens.map(token => div().flex_none().whitespace_nowrap()
        .text_color(syntaxColor(token.scope, t)).child(token.text || " ")));
  }

  diffCell(ref, side, h, rows, size, highlighted, positions) {
    const t = theme(), split = this.diffStyle === "split";
    // Bare line_height numbers are multipliers; row heights here are pixels.
    const cell = h_flex().flex_1().min_w(0).h_full().items_start().gap(8).px(8).overflow_hidden().line_height(Math.ceil(size * 1.8) + "px")
      .when(split && side === "LEFT", e => e.border_r(1).border_color(t.border));
    if (!ref) return cell.bg(t.raised);
    const {line, index} = ref, kind = line.text[0];
    const number = side === "LEFT" ? line.old : line.new;
    const tokens = highlighted[side][positions[index]];
    return cell.id(h.id + "-" + this.diffStyle + "-" + side + "-" + index)
      .bg(kind === "+" ? t.ansi2 + "18" : kind === "-" ? t.ansi1 + "18" : t.background)
      .children((split ? [number] : [line.old, line.new]).map(n => div().w(38).flex_none().text_right().text_color(t.dim).child(String(n ?? ""))))
      .child(div().w(12).flex_none().text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : t.dim).child(kind))
      .child(v_flex().flex_1().min_w(0).children(ref.wrapped.map(part => this.codeLine(part, size))));
  }

  loadFile(file, cx) {
    if (file.incomplete && !this.fileDiffs[file.filename]) {
      const {base, head} = this.data.snapshot;
      this.call("file-diff", {path: file.filename, base, head}, cx, result => {
        if (this.data?.snapshot.base !== result.base || this.data?.snapshot.head !== result.head) return;
        this.fileDiffs[file.filename] = result.file;
        this.loadedFiles.add(file.filename); this.focusedFile = file.filename;
      });
    } else { this.loadedFiles.add(file.filename); this.focusedFile = file.filename; cx.notify(); }
  }

  // Called during native layout: describe only this visible row, with no
  // event handlers or retained native state. The list owns line clicks.
  diffRow(entry) {
    const t = theme(), size = settings().font_size || 12;
    const split = this.diffStyle === "split", {hunk: h, block} = entry;
    const lexical = lexicalBlock(block);
    const highlighted = highlightRows(h.path, lexical.lexicalRows);
    const columns = Math.max(2, Math.floor((this.contentWidth / 2 - 94) / (size * 0.68)));
    const row = {...entry.row};
    if (split) for (const side of ["left", "right"]) {
      if (row[side]) row[side] = {...row[side], wrapped: wrapTokens(highlighted[side === "left" ? "LEFT" : "RIGHT"][lexical.positions[row[side].index]], columns)};
    }
    if (!split) row.stacked = {...row.stacked, wrapped: wrapTokens(highlighted[row.stacked.line.side][lexical.positions[row.stacked.index]], Math.max(2, Math.floor((this.contentWidth - 130) / (size * 0.68))))};
    const rowHeight = Math.ceil(size * 1.8) * (split ? Math.max(row.left?.wrapped.length || 1, row.right?.wrapped.length || 1) : row.stacked.wrapped.length);
    const element = h_flex().id(entry.id).w_full().min_w(0).h(rowHeight).flex_none()
      .font_family(settings().font_family || "JetBrains Mono").text_size(size).text_color(t.foreground);
    if (split) element.child(this.diffCell(row.left, "LEFT", h, block.rows, size, highlighted, lexical.positions))
      .child(this.diffCell(row.right, "RIGHT", h, block.rows, size, highlighted, lexical.positions));
    else element.child(this.diffCell(row.stacked, row.stacked.line.side, h, block.rows, size, highlighted, lexical.positions));
    // Stacked rows also wrap, so the continuous list has no nested scrollbars.
    return element;
  }

  actionRow(label, detail, active = false) {
    const t = theme();
    return v_flex().w_full().min_w(0).gap(6).p(10).my(3).rounded(5).bg(active ? t.selected : t.raised).cursor_pointer()
      .child(div().font_semibold().text_color(active ? t.accent : t.foreground).child(label))
      .children(detail ? [div().text_color(t.muted).child(detail)] : []);
  }

  changes() {
    const {snapshot: snap, saved} = this.data;
    const review = saved.reviews[this.provider]?.result;
    const hunks = Object.fromEntries(snap.files.flatMap(f => f.hunks.map(h => [h.id, h])));
    const deferred = new Map(snap.files.filter(f => deferredReason(f)).map(f => [f.filename, f]));
    const groups = review?.groups || snap.files.filter(f => f.hunks.length && !deferred.has(f.filename)).map(f => ({title: f.filename, purpose: "Run a review to group these hunks by logical purpose.", hunks: f.hunks.map(h => h.id)}));
    const entries = [];
    // Builders run only for visible rows. Actions belong to the list's render
    // pass, never to its deferred native item renderer.
    const add = (id, render, action) => entries.push({id, render, action});
    const addHunk = (h, prefix = "") => {
      const id = prefix + h.id, context = this.contexts[h.id];
      add(id + "-header", () => this.actionRow(h.path + " · " + h.header, "Ask about this hunk"), cx => this.select({hunk: h.id, path: h.path}, cx));
      if (!prefix && context?.more_above !== false) add(id + "-above", () => this.actionRow("↑ Show 20 lines above"), cx => this.expandContext(h, "above", cx));
      if (this.diffStyle === "split") add(id + "-sides", () => h_flex().text_color(theme().dim)
        .child(div().flex_1().child("Base · original")).child(div().flex_1().child("Head · proposed")));
      const findings = (review?.findings || []).filter(f => f.hunk === h.id);
      const comments = snap.inline.filter(c => c.path === h.path && c.commit_id === snap.head);
      for (const entry of diffEntries(h, context, this.diffStyle)) {
        entry.id = prefix + entry.id;
        entries.push(entry);
        if (!findings.length && !comments.length) continue;
        const matches = (side, number) => {
          if (number == null) return false;
          const ref = this.diffStyle === "split" ? entry.row[side === "LEFT" ? "left" : "right"] : entry.row.stacked;
          return ref?.line[side === "LEFT" ? "old" : "new"] === number;
        };
        for (const [i,f] of findings.entries()) if (matches(f.side, f.line)) add(entry.id + "-ai-" + i, () => this.card(entry.id + "-ai-" + i, this.provider + " · " + f.severity + " · " + f.title, f.body, theme().accent));
        for (const c of comments) if (matches(c.side || "RIGHT", c.line)) add(entry.id + "-gh-" + c.id, () => this.card(entry.id + "-gh-" + c.id, c.user.login + " · GitHub", c.body));
      }
      if (!prefix && context?.more_below !== false) add(id + "-below", () => this.actionRow("↓ Show 20 lines below"), cx => this.expandContext(h, "below", cx));
    };
    if (this.focusedFile) add("back-to-groups", () => this.actionRow("← Back to review groups"), cx => {
      this.loadedFiles.delete(this.focusedFile); this.focusedFile = null; cx.notify();
    });
    add("diff-style", () => this.actionRow("Diff view · " + (this.diffStyle === "split" ? "Split" : "Stacked"), "Click to switch to " + (this.diffStyle === "split" ? "stacked" : "split")), cx => {
      this.diffStyle = this.diffStyle === "split" ? "stacked" : "split"; localStorage.setItem("diffStyle", this.diffStyle); cx.notify();
    });
    if (!this.focusedFile) add("summary", () => review ? this.card("summary", "Review overview · " + this.provider, review.summary)
      : this.card("no-review", "Ready to review", "Choose Codex or Claude, then Run review. Until then, changes are listed by file. Saved reviews reopen without another agent run."));
    for (const file of snap.files.filter(f => f.incomplete && !deferred.has(f.filename))) add("missing-" + file.filename,
      () => this.card("missing-" + file.filename, "Limited diff · " + file.filename, "GitHub returned no patch or an incomplete patch. This file cannot be fully reviewed here.", theme().blocked));
    (this.focusedFile ? [] : groups).forEach((group, i) => {
      const id = "group-" + this.provider + "-" + group.hunks.slice().sort().join("-");
      const open = this.expanded.has(id), seen = saved.seen.includes(id);
      const files = [...new Set(group.hunks.map(h => hunks[h]?.path))];
      const findings = (review?.findings || []).filter(f => group.hunks.includes(f.hunk)).length;
      add(id, () => this.actionRow((open ? "▾ " : "▸ ") + (i + 1) + ". " + group.title,
        files.length + " files · " + group.hunks.length + " hunks · " + findings + " findings · " + files.join(" · "), open), cx => {
        if (open) this.expanded.delete(id); else this.expanded.add(id); cx.notify();
      });
      if (open) {
        add(id + "-purpose", () => this.markdown(id + "-purpose", group.purpose));
        add(id + "-seen", () => this.actionRow(seen ? "✓ Reviewed" : "Mark group reviewed", "Click to " + (seen ? "unmark" : "mark")), cx => this.call("seen", {id}, cx));
        add(id + "-ask", () => this.actionRow("Ask about this group"), cx => this.select({group: group.title, hunks: group.hunks}, cx));
        const skipped = files.filter(path => deferred.has(path));
        if (skipped.length) add(id + "-deferred", () => div().py(8).text_color(theme().muted).child(skipped.length + " generated or large file(s) deferred. Open them under Deferred files below."));
        for (const hid of group.hunks) if (hunks[hid] && !deferred.has(hunks[hid].path)) addHunk(hunks[hid]);
      }
    });
    if (deferred.size && !this.focusedFile) add("deferred-heading", () => div().pt(18).pb(8).font_semibold().child("Deferred files · " + deferred.size));
    for (const [path, file] of deferred) {
      if (this.focusedFile && path !== this.focusedFile) continue;
      const open = this.loadedFiles.has(path), loaded = this.fileDiffs[path] || file;
      add("deferred-" + path, () => this.actionRow((open ? "▾ Hide diff · " : "▸ Load diff · ") + path,
        deferredReason(file) + " · +" + (file.additions || 0) + " / −" + (file.deletions || 0) + (open ? "" : " · Diff not loaded"), open), cx => {
        if (open) { this.loadedFiles.delete(path); this.focusedFile = null; cx.notify(); } else this.loadFile(file, cx);
      });
      if (open) {
        if (loaded.incomplete) add("deferred-incomplete-" + path, () => this.card("deferred-incomplete-" + path, "Limited diff", "The available patch is incomplete.", theme().blocked));
        for (const h of loaded.hunks) addHunk(h, "deferred-");
        if (!loaded.hunks.length) add("deferred-empty-" + path, () => div().text_color(theme().muted).child("No textual changes in the available content."));
      }
    }
    return entries;
  }

  changeList() {
    const entries = this.changes();
    const byId = new Map(entries.map(e => [e.id,e]));
    return list("review-changes-" + this.diffStyle, entries.length, index => entries[index].id,
      index => entries[index].render ? entries[index].render() : this.diffRow(entries[index])).w_full().h(this.contentHeight)
      .on_item_click((key,cx) => {
        const e = byId.get(key); if (e?.action) { e.action(cx); return; } if (!e?.row) return;
        const side = this.diffStyle === "split" ? this.pointerSide : e.row.stacked.line.side;
        const ref = this.diffStyle === "split" ? e.row[side === "LEFT" ? "left" : "right"] : e.row.stacked;
        const number = ref?.line[side === "LEFT" ? "old" : "new"];
        if (number != null) this.select({hunk: e.hunk.id, path: e.hunk.path, side, line: number,
          context: e.block.rows.slice(Math.max(0,ref.index-10),ref.index+11)},cx);
      });
  }

  discussion() {
    const s = this.data.snapshot;
    return [this.card("description", s.author + " · PR description", s.body || "No description."),
      ...s.comments.map(c => this.card("comment-" + c.id, c.user.login + " · " + c.created_at, c.body)),
      ...s.reviews.map(c => this.card("review-" + c.id, c.user.login + " · " + c.state, c.body || "No review summary.")),
      ...s.inline.map(c => this.card("thread-" + c.id, c.user.login + " · " + c.path + ":" + (c.line ?? c.original_line ?? "outdated") + (c.line == null ? " · outdated" : ""), c.body))];
  }

  questions() {
    const t = theme(), saved = this.data.saved;
    return [div().text_color(t.muted).child("Questions and answers stay on this machine. Sending a batch uses the selected agent and the saved PR snapshot."),
      ...saved.questions.map(q => v_flex().gap(4).child(this.card("queued-" + q.id, "Queued · " + (q.target?.path || q.target?.group || "PR"), q.body)).child(this.button("remove-" + q.id, "Remove", cx => this.call("remove", {id: q.id}, cx)))),
      this.button("send-batch", "Send " + saved.questions.length + " queued questions to " + this.provider, cx => this.call("answer", {}, cx)),
      ...saved.batches.flatMap((batch, i) => batch.questions.map(q => this.card("answer-" + i + q.id, batch.provider + " · " + q.body, batch.answers.find(a => a.id === q.id)?.body || "No answer")))];
  }

  render() {
    const t = theme(), snap = this.data?.snapshot;
    const running = this.data?.jobs.find(j => j.status === "running");
    const children = [h_flex().flex_wrap().gap(8).items_center()
      .child(div().text_size(20).font_semibold().child("PR Review"))
      .child(Input.new(this.url).flex_1().h(34).px(8).bg(t.background).border(1).border_color(t.input).rounded(5))
      .child(this.button("open", "Open saved", cx => this.open(cx)))
      .child(this.button("refresh", "Fetch from GitHub", cx => { if (!this.busy) { this.activeUrl = this.url.value().trim(); localStorage.setItem("url", this.activeUrl); this.data = null; this.target = null; this.expanded.clear(); this.contexts = {}; this.loadedFiles.clear(); this.fileDiffs = {}; this.focusedFile = null; this.call("refresh", {}, cx); } })),
      h_flex().flex_wrap().gap(8).items_center().children(["codex", "claude"].map(p => this.button("provider-" + p, p === "codex" ? "Codex" : "Claude", cx => { this.provider = p; localStorage.setItem("provider", p); cx.notify(); }, this.provider === p)))
        .child(div().text_color(t.muted).child("Subscription CLI · local review cache"))];
    if (this.error) children.push(this.card("error", "Could not finish", this.error, t.blocked));
    if (this.busy || running) children.push(div().text_color(t.accent).child(this.busy ? "Loading…" : "Agent is " + (running.kind === "review" ? "reviewing the snapshot" : "answering your batch") + ". You can close this view; the task and results persist."));
    if (snap) {
      children.push(div().font_semibold().text_size(17).child(snap.repo + " #" + snap.number + " · " + snap.title));
      children.push(div().text_color(t.muted).child(snap.state + " · " + snap.files.length + " files · head " + snap.head.slice(0, 8) + " · fetched " + snap.fetched + " · Fetch from GitHub to check for new commits"));
      const last = this.data.jobs.find(j => j.provider === this.provider);
      if (last?.status === "error") children.push(this.card("job-error", last.provider + " task failed", last.error, t.blocked));
      children.push(h_flex().flex_wrap().gap(8).children(["changes", "discussion", "questions"].map(s => this.button("section-" + s, s === "questions" ? "Questions (" + this.data.saved.questions.length + ")" : s, cx => { this.section = s; cx.notify(); }, this.section === s)))
        .child(this.button("run-review", this.data.saved.reviews[this.provider] ? "Use saved review" : "Run review", cx => this.call("review", {}, cx)))
        .child(this.button("rerun", "Rerun review", cx => this.call("review", {force: true}, cx))));
      children.push(v_flex().id("review-content").flex_1().min_h(80).relative()
        .on_size_change((bounds,cx) => {
          const width = Math.floor(bounds.width / (settings().zoom || 1));
          const height = Math.floor(bounds.height / (settings().zoom || 1));
          if (width > 0 && height > 0 && (Math.abs(width-this.contentWidth)>1 || Math.abs(height-this.contentHeight)>1)) {
            this.contentWidth = width; this.contentHeight = height; cx.notify();
          }
        })
        .on_mouse_down("left", (e) => { if (e.local_position && e.bounds) this.pointerSide = e.local_position.x < e.bounds.width / 2 ? "LEFT" : "RIGHT"; })
        .child(this.section === "changes" ? this.changeList() : v_flex().id("review-scroll").size_full().overflow_y_scroll().gap(12).children(this.section === "discussion" ? this.discussion() : this.questions()))
        .child(Scrollbar.vertical(this.section === "changes" ? "review-changes-" + this.diffStyle : "review-scroll").absolute().inset_0()));
      children.push(v_flex().gap(6).border_t(1).border_color(t.border).pt(8)
        .child(h_flex().flex_wrap().gap(8).items_center().child(div().flex_1().text_color(t.muted).child(this.target ? "Question on " + (this.target.path || this.target.group) + (this.target.line ? ":" + this.target.line : "") : "Question about this PR · click a diff line to attach context"))
          .child(this.button("clear-target", "Clear context", cx => { this.target = null; cx.notify(); })))
        .child(Textarea.new(this.question).h(70).p(8).bg(t.background).border(1).border_color(t.input).rounded(5))
        .child(this.button("queue-question", "Queue question", cx => { const body = this.question.value().trim(); if (!body) return; this.call("question", {body, target: this.target}, cx, data => { this.data = data; this.question.set_value(""); localStorage.setItem("draft", ""); this.section = "questions"; }); })));
    } else {
      children.push(this.card("welcome", "Review in logical chunks", "Fetch a GitHub PR to start. Run a review with your signed-in Codex or Claude CLI to get an ordered reading plan, explanations and inline findings. Reopen a saved PR to work offline."));
      children.push(...this.history.map((h, i) => this.button("history-" + i, h.title, cx => { this.url.set_value(h.url); this.open(cx); })));
    }
    return v_flex().size_full().min_w(0).min_h(0).overflow_hidden().p(10).gap(10).bg(t.background).text_color(t.foreground).text_size(13).children(children);
  }
}
