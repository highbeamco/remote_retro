defmodule RemoteRetro.AI.Gemini do
  @moduledoc """
  Vertex AI Gemini `generateContent` over REST with structured JSON output.

  Options (merged over `config :remote_retro, :ai`): `:project`, `:location`,
  `:model`, `:token` (skip ADC, mainly for tests) and `:req_options` (merged
  into the Req request, e.g. `plug: {Req.Test, RemoteRetro.AI.Gemini}`).
  """
  @behaviour RemoteRetro.AI.Client

  alias RemoteRetro.AI

  @receive_timeout 40_000

  @impl true
  def generate_json(system, user, schema), do: generate_json(system, user, schema, [])

  @spec generate_json(String.t(), String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def generate_json(system, user, schema, opts) do
    config = Keyword.merge(AI.config(), opts)

    with {:ok, token} <- fetch_token(config),
         {:ok, response} <- post(config, token, request_body(system, user, schema)) do
      handle_response(response)
    end
  end

  @doc "The `generateContent` URL. The `global` location uses the non-regional host."
  def endpoint(project, location, model) do
    host =
      if location in [nil, "", "global"],
        do: "aiplatform.googleapis.com",
        else: "#{location}-aiplatform.googleapis.com"

    location = if location in [nil, ""], do: "global", else: location

    "https://#{host}/v1/projects/#{project}/locations/#{location}/publishers/google/models/#{model}:generateContent"
  end

  @doc false
  def request_body(system, user, schema) do
    %{
      systemInstruction: %{parts: [%{text: system}]},
      contents: [%{role: "user", parts: [%{text: user}]}],
      generationConfig: %{
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0
      }
    }
  end

  defp fetch_token(config) do
    case config[:token] do
      token when is_binary(token) -> {:ok, token}
      _ -> AI.Credentials.token()
    end
  end

  defp post(config, token, body) do
    [
      url:
        endpoint(config[:project], config[:location], config[:model] || "gemini-3.1-flash-lite"),
      json: body,
      auth: {:bearer, token},
      receive_timeout: @receive_timeout,
      retry: :transient,
      max_retries: 1
    ]
    |> Req.new()
    |> Req.merge(config[:req_options] || [])
    |> Req.post()
  end

  defp handle_response(%Req.Response{status: 200, body: body}), do: extract_json(body)

  defp handle_response(%Req.Response{status: status, body: body}) do
    message = if is_map(body), do: get_in(body, ["error", "message"]), else: nil
    {:error, {:http_error, status, message}}
  end

  @doc false
  def extract_json(%{"candidates" => [%{"content" => %{"parts" => parts}} | _]})
      when is_list(parts) do
    text =
      parts
      |> Enum.reject(&(&1["thought"] == true))
      |> Enum.map_join(&(&1["text"] || ""))

    case Jason.decode(text) do
      {:ok, map} when is_map(map) -> {:ok, map}
      {:ok, _} -> {:error, :invalid_json}
      {:error, _} -> {:error, :invalid_json}
    end
  end

  def extract_json(%{"candidates" => [%{"finishReason" => reason} | _]}),
    do: {:error, {:no_content, reason}}

  def extract_json(%{"promptFeedback" => %{"blockReason" => reason}}),
    do: {:error, {:blocked, reason}}

  def extract_json(_), do: {:error, :unexpected_response}
end
