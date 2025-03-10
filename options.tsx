import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Storage } from "@plasmohq/storage";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Logo } from "./components/ui/logo";

import "./style.css";

const storage = new Storage();

function OptionsPage() {
	const [apiKey, setApiKey] = useState("");
	const [saveStatus, setSaveStatus] = useState("");
	const [showKey, setShowKey] = useState(false);

	useEffect(() => {
		// Load saved API key on component mount
		const loadApiKey = async () => {
			try {
				const savedKey = await storage.get("openai-api-key");
				console.log(
					"Loaded API key from storage:",
					savedKey ? "Key exists" : "No key found",
				);
				if (savedKey) {
					setApiKey(savedKey);
				}
			} catch (error) {
				console.error("Error loading API key from storage:", error);
			}
		};
		loadApiKey();
	}, []);

	const handleSave = async () => {
		try {
			await storage.set("openai-api-key", apiKey);
			console.log("API key saved successfully");
			setSaveStatus("success");
			setTimeout(() => setSaveStatus(""), 3000);
		} catch (error) {
			console.error("Error saving API key:", error);
			setSaveStatus("error");
		}
	};

	return (
		<div className="min-h-screen bg-background py-12">
			<div className="max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="text-center mb-12">
					<div className="flex items-center justify-center space-x-3 mb-4">
						<Logo size="md" />
						<h1 className="text-3xl font-bold text-foreground">
							FeedMax Settings
						</h1>
					</div>
					<p className="text-muted-foreground max-w-md mx-auto">
						Configure your OpenAI API key to enable AI-powered post filtering on
						LinkedIn.
					</p>
				</div>

				{/* Main Content */}
				<div className="bg-card rounded-2xl shadow-lg p-8">
					<div className="space-y-8">
						{/* API Key Section */}
						<div>
							<label
								className="block text-sm font-medium text-foreground mb-2"
								htmlFor="apiKey"
							>
								OpenAI API Key
							</label>
							<div className="mt-1 relative rounded-md shadow-sm">
								<Input
									type={showKey ? "text" : "password"}
									id="apiKey"
									placeholder="sk-..."
									value={apiKey}
									onChange={(e) => setApiKey(e.target.value)}
								/>
								<button
									type="button"
									className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
									onClick={() => setShowKey(!showKey)}
								>
									{showKey ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</button>
							</div>
							<p className="mt-2 text-sm text-muted-foreground">
								Your API key will be stored securely in your browser's local
								storage.
							</p>
						</div>

						{/* Save Button */}
						<div className="flex items-center justify-between">
							<Button onClick={handleSave} variant="default">
								Save API Key
							</Button>

							{/* Save Status */}
							{saveStatus && (
								<div
									className={`flex items-center space-x-2 ${
										saveStatus === "success"
											? "text-green-600"
											: "text-destructive"
									}`}
								>
									{saveStatus === "success" ? (
										<>
											<CheckCircle2 className="h-5 w-5" />
											<span>API key saved successfully!</span>
										</>
									) : (
										<>
											<XCircle className="h-5 w-5" />
											<span>Error saving API key</span>
										</>
									)}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Help Text */}
				<div className="mt-8 text-center text-sm text-muted-foreground">
					<p>
						Need an OpenAI API key?{" "}
						<a
							href="https://platform.openai.com/account/api-keys"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:text-primary/90"
						>
							Get one here
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}

export default OptionsPage;
