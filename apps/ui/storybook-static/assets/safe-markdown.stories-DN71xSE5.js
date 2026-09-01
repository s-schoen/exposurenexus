import{n as e}from"./chunk-DnJy8xQt.js";import{t}from"./jsx-runtime-BX9360Lk.js";import{n,t as r}from"./safe-markdown-D7auk3ok.js";var i,a,o,s,c,l,u;e((()=>{n(),i=t(),a=`## Impact

Administrative interfaces are **reachable** from an untrusted network.

| Signal | Value |
| --- | --- |
| Port | 8443 |
| Path | /admin |

<details><summary>Request</summary>

\`\`\`http
GET /admin HTTP/1.1
Host: web-01.example.test
\`\`\`

</details>

- Restrict access to trusted networks
- Require strong authentication
`,o=`## Sanitized Content

<details open><summary>Allowed layout</summary>

Raw HTML details remain available for scanner evidence.

</details>

<p onclick="alert(1)" style="color:red">Unsafe attributes are removed.</p>

<script>alert("xss")<\/script>

![External image](https://example.com/image.png)

[Unsafe link](javascript:alert(1)) and [safe link](https://example.com).
`,s={title:`Components/SafeMarkdown`,component:r,parameters:{layout:`padded`},decorators:[e=>(0,i.jsx)(`div`,{className:`max-w-3xl rounded-xl border border-border bg-card p-6`,children:(0,i.jsx)(e,{})})],args:{children:a}},c={},l={args:{children:o}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    children: SANITIZED_MARKDOWN
  }
}`,...l.parameters?.docs?.source}}},u=[`RichContent`,`SanitizedContent`]}))();export{c as RichContent,l as SanitizedContent,u as __namedExportsOrder,s as default};