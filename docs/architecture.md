# Harness 架构图 — 第 1-4 章

> 以下 Mermaid 图展示 `harness-tutorial` 项目经过前 4 章构建后的完整架构。
> 可在 VS Code（安装 Markdown Preview Mermaid 插件）或 GitHub 上直接渲染。

---

## 1. 整体架构总览

```mermaid
graph TB
    subgraph USER["👤 用户代码"]
        APP["examples/ch04-tools.js<br/>run(provider, registry, msg)"]
    end

    subgraph LOOP["🔄 Agent Loop (agent.js)"]
        direction TB
        ASK["① Ask<br/>provider.complete(transcript, schemas)"]
        CLASSIFY["② Classify<br/>is_final? → return text<br/>is_tool_call? → dispatch"]
        BOUND["③ Bound<br/>MAX_ITERATIONS=20"]
        ASK --> CLASSIFY
        CLASSIFY -->|"tool_call"| DISPATCH["for each tool_call:<br/>registry.dispatch()"]
        DISPATCH --> ASK
    end

    subgraph PROVIDERS["🏭 Provider 层 (providers/)"]
        BASE["ProviderResponse<br/>text / tool_name / tool_args<br/>reasoning / tokens"]
        MOCK["MockProvider<br/>脚本化 fake，走查列表"]
        ANTHROPIC["AnthropicProvider<br/>翻译 Transcript → API"]
        OPENAI["OpenAIProvider<br/>Responses API adapter"]
        LOCAL["LocalProvider<br/>extends OpenAIProvider<br/>换 base_url"]
        BASE --- MOCK
        BASE --- ANTHROPIC
        BASE --- OPENAI
        BASE --- LOCAL
    end

    subgraph TOOLS["🔧 Tool 层 (tools/)"]
        T_BASE["Tool<br/>name / description<br/>inputSchema / run<br/>sideEffects"]
        T_DECORATOR["tool() 装饰器<br/>@type 注释 → schema"]
        T_REG["ToolRegistry<br/>add / schemas / dispatch<br/>dispatch 永不抛异常"]
        T_STD["std.js: calc / read_file<br/>write_file / bash"]
        T_BASE --> T_DECORATOR
        T_BASE --> T_REG
        T_BASE --> T_STD
    end

    subgraph DATA["📦 数据类型 (messages.js)"]
        BLOCKS["Block = TextBlock | ToolCall<br/>| ToolResult | ReasoningBlock<br/>全部 Object.freeze()"]
        MSG["Message<br/>role + blocks[]<br/>+ UUID + timestamp<br/>工厂方法: userText/<br/>assistantText/<br/>fromAssistantResponse"]
        TR["Transcript<br/>messages[] + system<br/>append/extend/last"]
        BLOCKS --> MSG
        MSG --> TR
    end

    APP --> LOOP
    LOOP -->|"complete(transcript, schemas)"| PROVIDERS
    LOOP -->|"dispatch(name, args, id)"| TOOLS
    LOOP -->|"读写 transcript"| DATA
    TOOLS -->|"ToolResult (is_error?)"| DATA
    PROVIDERS -->|"ProviderResponse"| DATA

    style USER fill:#e8f5e9,stroke:#2e7d32
    style LOOP fill:#fff3e0,stroke:#e65100
    style PROVIDERS fill:#e3f2fd,stroke:#1565c0
    style TOOLS fill:#fce4ec,stroke:#c62828
    style DATA fill:#f3e5f5,stroke:#6a1b9a
```

---

## 2. Agent 循环 — 3 个决策

```mermaid
flowchart TD
    START(["run(provider, registry, userMessage)"]) --> INIT["创建 Transcript<br/>append user 消息<br/>schemas = registry.schemas()"]
    INIT --> LOOP{"i < MAX_ITERATIONS<br/>(20)?"}

    LOOP -->|"是"| COMPLETE["response = provider<br/>.complete(transcript, schemas)"]

    COMPLETE --> IS_FINAL{"response<br/>.is_final?"}
    IS_FINAL -->|"✅ 是"| DONE["append assistant 消息<br/>return response.text"]
    IS_FINAL -->|"❌ 否 (是 tool_call)"| APPEND_ASST["append assistant 消息<br/>(含 ToolCall blocks)"]

    APPEND_ASST --> EACH_CALL["for each tool_call in response"]

    EACH_CALL --> DISPATCH["result = registry<br/>.dispatch(name, args, id)"]
    DISPATCH --> APPEND_RESULT["append tool_result 消息<br/>(is_error 时模型自己纠正)"]

    APPEND_RESULT --> EACH_CALL
    EACH_CALL -->|"全部处理完"| LOOP

    LOOP -->|"❌ 超限"| THROW["throw 'did not finish<br/>in MAX_ITERATIONS'"]

    DONE --> END(["返回 final answer 文本"])

    style DONE fill:#c8e6c9,stroke:#2e7d32
    style THROW fill:#ffcdd2,stroke:#c62828
    style DISPATCH fill:#fff9c4,stroke:#f9a825
```

---

## 3. 工具执行管线 — 从模型输出到结果

```mermaid
flowchart LR
    subgraph MODEL["🤖 模型输出"]
        TC["tool_call<br/>name='calc'<br/>args={expression:'2+2'}<br/>id='call-1'"]
    end

    subgraph REGISTRY["🔍 ToolRegistry.dispatch()"]
        direction TB
        STEP1["① name 存在?"]
        STEP2["② 查 Tool.run"]
        STEP3["③ try/catch 执行"]
        STEP4["④ 返回 ToolResult"]

        STEP1 -->|"❌ 没有"| ERR1["ToolResult<br/>is_error=true<br/>content='unknown tool: X<br/>available: [...list...]'"]
        STEP1 -->|"✅ 有"| STEP2
        STEP2 --> STEP3
        STEP3 -->|"💥 throw"| ERR2["ToolResult<br/>is_error=true<br/>content='X raised Error: ...'"]
        STEP3 -->|"✅ ok"| OK["ToolResult<br/>is_error=false<br/>content='4'"]
    end

    subgraph TOOL["⚙️ Tool.run(args)"]
        direction TB
        T1["args = {expression:'2+2'}"]
        T2["传给 this._fn(args)"]
        T3["_fn 解构: ({expression})"]
        T4["执行: eval('2+2')"]
        T5["返回 String('4')"]
        T1 --> T2 --> T3 --> T4 --> T5
    end

    TC --> STEP1
    TOOL ~~~ T1

    style ERR1 fill:#ffcdd2,stroke:#c62828
    style ERR2 fill:#ffcdd2,stroke:#c62828
    style OK fill:#c8e6c9,stroke:#2e7d32
```

---

## 4. 数据类型层级 — Block → Message → Transcript

```mermaid
classDiagram
    class TextBlock {
        +kind: "text"
        +text: string
    }
    class ToolCall {
        +kind: "tool_call"
        +id: string
        +name: string
        +args: object
    }
    class ToolResult {
        +kind: "tool_result"
        +call_id: string
        +content: string
        +is_error: boolean
    }
    class ReasoningBlock {
        +kind: "reasoning"
        +text: string
        +metadata: object
    }

    class Message {
        +role: "user"|"assistant"|"system"
        +blocks: Block[]
        +id: string (UUID)
        +createdAt: number
        +static userText(text) Message
        +static assistantText(text, reasoning?) Message
        +static assistantToolCall(call, reasoning?) Message
        +static toolResult(result) Message
        +static fromAssistantResponse(response) Message
    }

    class Transcript {
        +messages: Message[]
        +system: string|null
        +append(message) void
        +extend(messages) void
        +last() Message|undefined
        +length number
    }

    class ProviderResponse {
        +text: string|null
        +tool_calls: ToolCallRef[]
        +reasoning_text: string|null
        +input_tokens: number
        +output_tokens: number
        +is_final boolean
        +is_tool_call boolean
    }

    class Tool {
        +name: string
        +description: string
        +inputSchema: object
        +sideEffects: Set~SideEffect~
        +run(args) string
        +schemaForProvider() object
    }

    class Block {
        <<interface>>
    }

    TextBlock ..|> Block
    ToolCall ..|> Block
    ToolResult ..|> Block
    ReasoningBlock ..|> Block

    Message o-- "1..*" TextBlock
    Message o-- "1..*" ToolCall
    Message o-- "1..*" ToolResult
    Message o-- "1..*" ReasoningBlock

    Transcript o-- "0..*" Message

    ProviderResponse --> ToolCall : "拆出"
    ProviderResponse --> TextBlock : "拆出"
    ProviderResponse --> ReasoningBlock : "拆出"

    Tool --> ToolResult : "run() 产出"
```

---

## 5. Provider 适配器 — 三厂商，一份协议

```mermaid
graph TB
    subgraph PROTOCOL["Provider 协议"]
        IFACE["complete(transcript, schemas) → ProviderResponse<br/>name: string"]
    end

    subgraph ADAPTERS["三个 Adapter"]
        MOCK2["MockProvider<br/>name='mock'<br/>离线、确定性、零成本"]
        ANTH2["AnthropicProvider<br/>name='anthropic'<br/>穷举 match 翻译 4 种 Block<br/>signature round-trip"]
        OPENAI2["OpenAIProvider<br/>name='openai'<br/>Responses API<br/>function_call/function_call_output"]
    end

    LOCAL2["LocalProvider extends OpenAIProvider<br/>name='local'<br/>换 base_url → llama.cpp/vLLM/Ollama"]

    IFACE --> MOCK2
    IFACE --> ANTH2
    IFACE --> OPENAI2
    OPENAI2 --> LOCAL2

    style PROTOCOL fill:#e8eaf6,stroke:#283593
    style ADAPTERS fill:#e3f2fd,stroke:#1565c0
```

---

## 6. 调用链全景 — 一次完整的 calculator 回合

```mermaid
sequenceDiagram
    actor User
    participant Example as examples/ch04-tools.js
    participant Run as agent.run()
    participant Transcript as Transcript
    participant Provider as MockProvider
    participant Registry as ToolRegistry
    participant Tool as Tool('calc')
    participant Fn as _fn({expression})

    User->>Example: node examples/ch04-tools.js
    Example->>Run: run(mock, registry, "What is 2+2?")

    Note over Run: Round 1
    Run->>Transcript: append(Message.userText("What is 2+2?"))
    Run->>Provider: complete(transcript, schemas)
    Provider-->>Run: ProviderResponse { tool_name:'calc', args:{expression:'2+2'}, id:'call-1' }

    Note over Run: response.is_final? → false
    Run->>Transcript: append(Message.fromAssistantResponse(...))

    Run->>Registry: dispatch('calc', {expression:'2+2'}, 'call-1')
    Registry->>Registry: ① name='calc' 存在 ✅
    Registry->>Tool: run({expression:'2+2'})
    Tool->>Fn: this._fn({expression:'2+2'})
    Fn-->>Tool: '4'
    Tool-->>Registry: '4'
    Registry-->>Run: ToolResult('call-1', '4', is_error=false)
    Run->>Transcript: append(Message.toolResult(...))

    Note over Run: Round 2
    Run->>Provider: complete(transcript, schemas)
    Provider-->>Run: ProviderResponse { text:'The file contained: hello world' }

    Note over Run: response.is_final? → true ✅
    Run->>Transcript: append(Message.fromAssistantResponse(...))
    Run-->>Example: "The file contained: hello world"
    Example-->>User: console.log(answer)
```

---

## 7. 文件结构 — 4 章后的代码布局

```mermaid
graph LR
    subgraph "src/harness/"
        AGENT["agent.js<br/>━━━━━━━━<br/>run() 循环<br/>3 决策 / 20 次上限"]
        MSG2["messages.js<br/>━━━━━━━━<br/>TextBlock / ToolCall<br/>ToolResult / ReasoningBlock<br/>Message / Transcript"]
        subgraph "providers/"
            PBASE["base.js — ProviderResponse"]
            PMOCK["mock.js — MockProvider"]
            PANTH["anthropic.js — AnthropicProvider"]
            POPEN["openai.js — OpenAIProvider"]
            PLOCAL["local.js — LocalProvider"]
            PIDX["index.js — re-export all"]
        end
        subgraph "tools/"
            TBASE["base.js — Tool 类"]
            TDEC["decorator.js — tool()"]
            TREG["registry.js — ToolRegistry"]
            TSTD["std.js — calc/read_file/write_file/bash"]
            TIDX["index.js — re-export all"]
        end
    end
    subgraph "tests/"
        SMOKE["smoke.test.js"]
        T02["ch02-agent.test.js<br/>(7 tests)"]
        T03["ch03-transcript.test.js<br/>(26 tests)"]
        T04["ch04-tools.test.js<br/>(26 tests)"]
    end
    subgraph "examples/"
        EX02["ch02-calculator.js"]
        EX03["ch03-real-provider.js"]
        EX04["ch04-tools.js"]
    end

    style AGENT fill:#fff3e0,stroke:#e65100
    style MSG2 fill:#f3e5f5,stroke:#6a1b9a
    style T04 fill:#e8f5e9,stroke:#2e7d32
```

---

## 8. 5 个 Break — 全书路线图

```mermaid
graph LR
    subgraph "第 2 章定义的 5 个 Break"
        B1["Break ① unknown tool<br/>━━━━━━━━<br/>模型叫了不存在的工具"]
        B2["Break ② schema mismatch<br/>━━━━━━━━<br/>参数 key 对不上"]
        B3["Break ③ tool throws<br/>━━━━━━━━<br/>工具内部崩了"]
        B4["Break ④ 无限循环<br/>━━━━━━━━<br/>agent 永远不 final"]
        B5["Break ⑤ 大量上下文<br/>━━━━━━━━<br/>工具返回太多内容"]
    end

    B1 -->|"Ch3: try/except<br/>Ch4: ToolRegistry.dispatch<br/>返回 is_error"| FIXED1["✅ 已修复"]
    B2 -->|"Ch6: Ajv 校验<br/>（待实现）"| TODO2["⏳ Ch6"]
    B3 -->|"Ch4: ToolRegistry.dispatch<br/>try/catch 捕获"| FIXED3["✅ 已修复"]
    B4 -->|"MAX_ITERATIONS=20<br/>暂用硬上限"| PARTIAL4["⚠️ 暂用硬上限<br/>Ch21: Checkpointer"]
    B5 -->|"工具设上限<br/>（待系统化）"| TODO5["⏳ Ch7+: 记账器"]

    style FIXED1 fill:#c8e6c9,stroke:#2e7d32
    style FIXED3 fill:#c8e6c9,stroke:#2e7d32
    style PARTIAL4 fill:#fff9c4,stroke:#f9a825
    style TODO2 fill:#ffcdd2,stroke:#c62828
    style TODO5 fill:#ffcdd2,stroke:#c62828
```

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Block 可变性 | `Object.freeze()` | 不可变 = 可缓存、可并行、可比较 |
| dispatch 异常处理 | 返回 `is_error` ToolResult，不抛 | 模型能读懂结构化错误并自我纠正 |
| 工具参数传递 | `run(args)` 传整个对象 | 函数用解构 `({ expr })` 取，和 JSON Schema 对齐 |
| schema 推导 | `@type` 内联注释 | JS 无 Python type hints，用 JSDoc `@type` 代替 |
| 标准工具声明 | 直接 `new Tool({...})` | 复杂工具显式写 schema，简单工具用 `tool()` 装饰器 |
| Provider 协议 | `complete(transcript, schemas)` | 所有 adapter 只依赖这一个方法签名 |
| 副作用标签 | 现在就标 | 第 14 章 PermissionManager 和第 21 章 Checkpointer 靠它决策 |
