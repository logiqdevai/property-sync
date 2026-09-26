"""Build-time only (Dockerfile stage 1): export the free open-source watermark detector prithivMLmods/Watermark-Detection-SigLIP2 (Apache-2.0,
SigLIP ViT-B/16 fine-tuned for watermark detection) to ONNX, keeping only the 768-number photo embedding (the mean of the last hidden state, i.e. the input of the model's
own classifier head). The app then trains nothing at run time: it runs this ONNX file with onnxruntime and applies wm_model.json (a small logistic regression fitted on
the manual by-eye verdicts, see wm_train.py). Usage: python wm_export.py OUT.onnx"""
import sys, torch
from transformers import AutoModelForImageClassification

NAME = 'prithivMLmods/Watermark-Detection-SigLIP2'


class Embed(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.v = m.vision_model
    def forward(self, x): return self.v(pixel_values=x).last_hidden_state.mean(dim=1)


if __name__ == '__main__':
    out = sys.argv[1]
    m = AutoModelForImageClassification.from_pretrained(NAME).eval()
    e = Embed(m).eval(); x = torch.randn(2, 3, 224, 224)
    torch.onnx.export(e, (x,), out, input_names=['pixel_values'], output_names=['embedding'], dynamic_axes={'pixel_values': {0: 'b'}, 'embedding': {0: 'b'}}, opset_version=17, dynamo=False)
    print('exported', out)
