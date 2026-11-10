defmodule RemoteRetro.AI.GeminiTest do
  use ExUnit.Case, async: true
  alias RemoteRetro.AI.Gemini

  @schema %{"type" => "OBJECT", "properties" => %{"ok" => %{"type" => "BOOLEAN"}}}

  defp opts(extra \\ []) do
    Keyword.merge(
      [
        project: "proj",
        location: "global",
        model: "gemini-3.1-flash-lite",
        token: "test-token",
        req_options: [plug: {Req.Test, Gemini}, retry_delay: 0, retry_log_level: false]
      ],
      extra
    )
  end

  defp candidate(parts),
    do: %{"candidates" => [%{"content" => %{"role" => "model", "parts" => parts}}]}

  test "posts a structured-output request with a bearer token" do
    test_pid = self()

    Req.Test.stub(Gemini, fn conn ->
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      send(test_pid, {:request, conn, Jason.decode!(body)})
      Req.Test.json(conn, candidate([%{"text" => ~s({"ok": true})}]))
    end)

    assert {:ok, %{"ok" => true}} = Gemini.generate_json("sys", "user", @schema, opts())

    assert_received {:request, conn, body}
    assert conn.method == "POST"
    assert conn.host == "aiplatform.googleapis.com"

    assert conn.request_path ==
             "/v1/projects/proj/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent"

    assert Plug.Conn.get_req_header(conn, "authorization") == ["Bearer test-token"]

    assert body == %{
             "systemInstruction" => %{"parts" => [%{"text" => "sys"}]},
             "contents" => [%{"role" => "user", "parts" => [%{"text" => "user"}]}],
             "generationConfig" => %{
               "responseMimeType" => "application/json",
               "responseSchema" => @schema,
               "temperature" => 0
             }
           }
  end

  test "uses the regional host for non-global locations" do
    assert Gemini.endpoint("p", "us-central1", "m") ==
             "https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/m:generateContent"

    assert Gemini.endpoint("p", "global", "m") ==
             "https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/m:generateContent"
  end

  test "ignores thought parts and joins text parts" do
    Req.Test.stub(Gemini, fn conn ->
      Req.Test.json(
        conn,
        candidate([
          %{"text" => "thinking...", "thought" => true},
          %{"text" => ~s({"a":)},
          %{"text" => "1}"}
        ])
      )
    end)

    assert {:ok, %{"a" => 1}} = Gemini.generate_json("s", "u", @schema, opts())
  end

  test "returns errors for invalid JSON, missing content and HTTP failures" do
    Req.Test.stub(Gemini, fn conn -> Req.Test.json(conn, candidate([%{"text" => "not json"}])) end)

    assert {:error, :invalid_json} = Gemini.generate_json("s", "u", @schema, opts())

    Req.Test.stub(Gemini, fn conn ->
      Req.Test.json(conn, %{"candidates" => [%{"finishReason" => "SAFETY"}]})
    end)

    assert {:error, {:no_content, "SAFETY"}} = Gemini.generate_json("s", "u", @schema, opts())

    Req.Test.stub(Gemini, fn conn ->
      conn
      |> Plug.Conn.put_status(403)
      |> Req.Test.json(%{"error" => %{"message" => "Permission denied"}})
    end)

    assert {:error, {:http_error, 403, "Permission denied"}} =
             Gemini.generate_json("s", "u", @schema, opts())
  end

  test "retries once on 5xx" do
    {:ok, counter} = Agent.start_link(fn -> 0 end)

    Req.Test.stub(Gemini, fn conn ->
      case Agent.get_and_update(counter, &{&1, &1 + 1}) do
        0 ->
          conn |> Plug.Conn.put_status(503) |> Req.Test.json(%{"error" => %{"message" => "busy"}})

        _ ->
          Req.Test.json(conn, candidate([%{"text" => "{}"}]))
      end
    end)

    assert {:ok, %{}} = Gemini.generate_json("s", "u", @schema, opts())
    assert Agent.get(counter, & &1) == 2
  end

  test "gives up after one retry" do
    Req.Test.stub(Gemini, fn conn -> conn |> Plug.Conn.put_status(500) |> Req.Test.json(%{}) end)
    assert {:error, {:http_error, 500, nil}} = Gemini.generate_json("s", "u", @schema, opts())
  end
end
