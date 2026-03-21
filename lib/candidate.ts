// lib/candidate.ts
// This file contains all personal profile data for Suman Madipeddi.
// It is the single source of truth for job scoring and outreach generation.

export interface Experience {
  role: string;
  company: string;
  location: string;
  period: string;
  points: string[];
}

export interface Project {
  name: string;
  date: string;
  stack: string[];
  hook: string;
  github: string;
}

export const MY_PROFILE = {
  name: "Suman Madipeddi",
  email: "madipeddisuman@gmail.com",
  phone: "+1 (602) 565-9192",
  linkedin: "https://www.linkedin.com/in/suman-madipeddi",
  github: "https://github.com/SumanMadipeddi",
  portfolio: "https://sumanmadipeddi.space/",
  location: "San Jose, CA, USA",
  title: "Founding AI/ML Engineer",
  summary: "AI/ML Engineer with 2 years of experience building and deploying scalable, end-to-end machine learning systems from concept to production. Specialized in fine-tuning large language models (LLMs), developing multi-agent systems, and implementing RAG pipelines for enterprise-grade applications. Proven ability to reduce inference costs, optimize latency, and ship products with thousands of active users.",
  visa: "F1 — requires H1B sponsorship",
  
  education: {
    degree: "M.S. Robotics and Autonomous Systems (AI/ML specialization)",
    university: "Arizona State University",
    gpa: "3.8",
    graduation: "May 2025",
  },

  experience: [
    {
      role: "AI/ML Software Engineer",
      company: "Stealth AI Startup",
      location: "San Jose, CA",
      period: "Oct 2025 – Present",
      points: [
        "Orchestrated multi-agent systems for document intelligence and knowledge graph creation using LangGraph, achieving 96% data extraction accuracy.",
        "Built and managed a knowledge graph with over 10,000 nodes, enabling an intent-based retrieval copilot.",
      ],
    },
    {
      role: "Founding AI Engineer",
      company: "Minor Chores",
      location: "USA",
      period: "Aug 2024 – Oct 2025",
      points: [
        "Fine-tuned LLaMA-3.1-8B using PEFT LoRA, reducing inference costs by 78% while achieving a 120ms P95 latency with vLLM.",
        "Developed and deployed a RAG chatbot on Vertex AI and Pinecone, successfully serving over 3,000 queries per month.",
        "Shipped a full-stack React application (iOS/Android) on AWS ECS Fargate to a user base of over 1,000.",
        "Increased user engagement by 30% and reduced application latency by 40% through targeted optimizations.",
      ],
    },
  ] as Experience[],

  skills: [
    'Python', 'Swift', 'C++', 'TypeScript', 'JavaScript', 'Node.js', 'Django', 'FastAPI',
    'React', 'Next.js', 'Tailwind', 'GraphQL', 'PyTorch', 'TensorFlow', 'Keras', 'JAX',
    'CoreML', 'TensorRT', 'ONNX', 'OpenCV', 'Stable Diffusion', 'CUDA', 'CLIP', 'YOLO',
    'LangChain', 'LangGraph', 'A2A', 'mcp-use', 'Fine-tuning', 'PEFT', 'QLoRA', 'RLHF',
    'vLLM', 'Pinecone', 'Qdrant', 'RAG', 'Multi-Agent Systems', 'XGBoost', 'HuggingFace',
    'VLMs', 'VLAs', 'OpenAI API', 'Anthropic', 'Gemini', 'Streamlit', 'Scikit-Learn',
    'LiveKit', 'Twilio', 'Deepgram', 'Pandas', 'NumPy', 'ETL', 'SQL', 'NoSQL', 'MongoDB',
    'Supabase', 'PostgreSQL', 'Neo4j', 'Redis', 'SageMaker', 'Bedrock', 'AWS', 'EC2',
    'Lambda', 'S3', 'EKS', 'ECS', 'DynamoDB', 'GCP Vertex AI', 'Azure', 'Docker',
    'Kubernetes', 'GitHub Actions',
  ],

  metrics: {
    costReduction: "78% reduction in inference costs",
    latency: "120ms P95 latency",
    extractionAccuracy: "96% extraction accuracy",
    executionAccuracy: "90% execution accuracy",
    queryVolume: "3000+ queries/month",
    userBase: "1000+ users shipped",
    engagementBoost: "30% engagement boost",
  },

  projects: [
    { name: "Multi-Agent Mobile QA System", date: "Dec 2025", stack: ['Agent S3', 'VLM', 'UI-TARS-1.5-7B', 'ADB'], hook: "Supervisor-Planner-Executor model achieved 90% accuracy on 10+ step mobile workflows.", github: "https://github.com/SumanMadipeddi/mobile-QA-Agent" },
    { name: "RAG-Enabled Voice AI Agent", date: "Nov 2025", stack: ['LiveKit', 'Pinecone', 'LangChain', 'OpenAI', 'Gemini', 'Deepgram', 'React'], hook: "Built a <200ms latency healthcare voice agent querying over 1000 JSON clinical records.", github: "https://github.com/SumanMadipeddi/voice-agent-rag" },
    { name: "Agentic GraphRAG System", date: "Dec 2025", stack: ['LangGraph', 'LangChain', 'Supabase', 'TypeScript', 'PostgreSQL'], hook: "Created a 2800+ node knowledge graph enabling multi-hop reasoning with 95% accuracy.", github: "https://github.com/SumanMadipeddi/graphRAG-Agent" },
    { name: "AI Funnel Intelligence System", date: "Oct 2025", stack: ['LangGraph', 'FastMCP', 'MCP-Use', 'LangSmith', 'Playwright', 'Next.js', 'FastAPI'], hook: "Improved competitor ad funnel analysis efficiency by 80% using autonomous agents.", github: "https://github.com/SumanMadipeddi/mcp-langgraph-agents" },
    { name: "Scalable LLM Fine-Tuning & Inference", date: "Aug 2025", stack: ['LLaMA-3.1-8B', 'LoRA', 'vLLM', 'CUDA', 'bitsandbytes'], hook: "Achieved 40% lower latency via 4-bit quantization and optimized KV caching.", github: "https://github.com/SumanMadipeddi/vllm-finetuned-inference-serving" },
    { name: "Voice AI for Lead Qualification", date: "Aug 2025", stack: ['Twilio', 'Deepgram', 'TypeScript', 'Docker', 'GPT-4'], hook: "Built a 24/7 autonomous agent that eliminated 25+ hours/week of manual work.", github: "https://github.com/SumanMadipeddi/Setter.AI" },
    { name: "Vision Agents Real-Time Surveillance", date: "Dec 2025", stack: ['GStreamer', 'OpenCV', 'YOLOv11', 'TensorRT', 'ONNX', 'NVIDIA GPU'], hook: "Deployed on-prem, multi-camera RTSP system at 30 FPS for VLM-based behavior prediction.", github: "https://github.com/SumanMadipeddi/Text2Vision" }, // Note: User provided Text2Vision URL for this project
    { name: "On-Device Gesture Recognition", date: "June 2025", stack: ['Flax/JAX', 'ONNX', 'CUDA', 'Whisper', 'OpenCV'], hook: "Achieved 93% accuracy on 17 gestures at 60 FPS (<30ms) for privacy-first control.", github: "https://github.com/SumanMadipeddi/" }, // No specific repo provided
    { name: "Multi-Modal Text-to-Video System", date: "Aug 2025", stack: ['Stable Diffusion', 'Wan2.2', 'PyTorch', 'FFmpeg', 'React', 'Express'], hook: "Generated 10+ minute 720p videos from text with 40% latency reduction.", github: "https://github.com/SumanMadipeddi/Text2Vision" },
  ] as Project[],

  outreachVariants: {
    'A': "I'm Suman — I've built end-to-end agentic AI systems, healthcare voice agents, and ML pipelines. Excited about agentic systems in healthcare.",
    'B': "I'm Suman — I've built agentic AI, backend infrastructure, ML pipelines, and voice agents. Excited about agentic infra systems.",
    'C': "I'm Suman — I've built computer use agents, backend infra, and ML pipelines. Interested in applied decision-making roles.",
    'D': "I'm Suman — I've built on-device ML with privacy-first design, agentic systems, and backend infrastructure.",
  }
};
